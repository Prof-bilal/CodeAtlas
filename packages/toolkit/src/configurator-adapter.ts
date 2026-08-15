import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ConfigurationChange, ConfigurationTarget } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import {
  ConfigMergeError,
  ConfigReadError,
  ConfigVerifyError,
  ConfigWriteError,
} from "./configurator-errors";
import { mergeTomlSection, parseTomlDocument, serializeTomlDocument } from "./configurator-toml";
import { parseJsonc } from "./jsonc";

/**
 * Everything one adapter needs to describe and build a configuration change
 * for **one tool** in **one user-config home**. This is the per-target seam —
 * a new target is a new small adapter, never a branch in the service.
 */
export interface ConfigurationContext {
  /** Tool id (validated before reaching here). */
  readonly toolName: string;
  /** Installed tool version, or `null` when unknown. */
  readonly toolVersion: string | null;
  /** Tool is an MCP server — register it under each agent's MCP section. */
  readonly mcp: boolean;
  /** User-config root; every target path derives from here, never from the
   *  analyzed repository (`docs/SECURITY.md` — repo files are untrusted). */
  readonly configHome: string;
  /** ISO-8601 timestamp of the current run (recorded by the MCP adapter). */
  readonly timestamp: string;
}

/** The on-disk document format of a managed config file (ADR-010). */
export type ConfigFormat = "json" | "jsonc" | "toml";

/**
 * One configuration adapter per target (Claude / Gemini / Codex / OpenCode /
 * MCP / VS Code), mirroring `@atlas/providers` and `@atlas/agents`.
 *
 * Provider-specific facts — the config file each target reads, the section
 * it writes into, the entry shape, and the change description — live
 * **inside the adapter**, never in the service.
 */
export interface ConfigurationAdapter {
  readonly target: ConfigurationTarget;
  /** Human label, e.g. `"Claude Code"`. */
  readonly label: string;
  /**
   * The `AgentPort` provider id whose CLI must be installed for this target
   * to be applicable (`claude` / `gemini` / `codex` / `opencode`), or `null`
   * for host-style targets (MCP registration, VS Code) that are always
   * present. Detection is never reimplemented here — it routes through
   * `AgentPort`.
   */
  readonly requiresAgent: string | null;
  /**
   * The on-disk document format of the managed config file: `"json"`
   * (default), `"jsonc"` (OpenCode — comments/trailing commas stripped on
   * read, written as plain JSON, which is valid JSONC), or `"toml"` (Codex
   * written via a surgical, comment-preserving section merge). See ADR-010.
   */
  readonly format?: ConfigFormat;
  /** Resolve the user-config file this adapter manages. */
  configPath(ctx: ConfigurationContext): string;
  /** The top-level JSON section the adapter manages, or `null` when the whole
   *  document is the map (the MCP server index). */
  rootKey(ctx: ConfigurationContext): string | null;
  /** Build the entry recorded under `rootKey[ctx.toolName]` (or at
   *  `[ctx.toolName]` when `rootKey` is `null`). */
  buildEntry(ctx: ConfigurationContext): Readonly<Record<string, unknown>>;
  /** Short human description of the change, for plans and dry runs. */
  describe(ctx: ConfigurationContext): string;
}

/**
 * The I/O boundary for config files, injectable so apply/backup/rollback are
 * fully unit-testable against a fake (and no real user config is ever touched
 * in tests). Reads return `ok(null)` for a missing file.
 */
export interface ConfigWriter {
  read(path: string): Promise<Result<string | null>>;
  write(path: string, content: string): Promise<Result<void>>;
  copy(from: string, to: string): Promise<Result<void>>;
  remove(path: string): Promise<Result<void>>;
}

/** A real file-system {@link ConfigWriter} (user config, never the repo). */
export class FsConfigWriter implements ConfigWriter {
  public async read(path: string): Promise<Result<string | null>> {
    try {
      if (!existsSync(path)) {
        return ok(null);
      }
      return ok(await readFile(path, "utf8"));
    } catch (error) {
      return fail(new ConfigReadError(path, error));
    }
  }

  public async write(path: string, content: string): Promise<Result<void>> {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      return ok(undefined);
    } catch (error) {
      return fail(new ConfigWriteError(path, error));
    }
  }

  public async copy(from: string, to: string): Promise<Result<void>> {
    try {
      await mkdir(dirname(to), { recursive: true });
      await copyFile(from, to);
      return ok(undefined);
    } catch (error) {
      return fail(new ConfigWriteError(to, error));
    }
  }

  public async remove(path: string): Promise<Result<void>> {
    try {
      await rm(path, { force: true });
      return ok(undefined);
    } catch (error) {
      return fail(new ConfigWriteError(path, error));
    }
  }
}

/**
 * Build the exact {@link ConfigurationChange} an adapter would apply for a
 * tool, given the current on-disk content (`null` = file does not exist).
 *
 * Safety: existing config is **merged, never clobbered**. If the existing file
 * is not valid JSON, is not a JSON object, or the adapter's section exists but
 * is not an object, the change returns `problems` and `mergedDocument: null`
 * — the service refuses to write it. An identical, already-present entry
 * yields `alreadyConfigured: true` (no write is needed).
 */
export function buildConfigurationChange(
  adapter: ConfigurationAdapter,
  ctx: ConfigurationContext,
  existing: string | null,
): ConfigurationChange {
  const base = {
    target: adapter.target,
    label: adapter.label,
    filePath: adapter.configPath(ctx),
    description: adapter.describe(ctx),
    backupPath: null,
    verified: null,
  };
  const rootKey = adapter.rootKey(ctx);
  const entryKey = ctx.toolName;
  const entry = adapter.buildEntry(ctx);

  if (existing === null) {
    return {
      ...base,
      fileExisted: false,
      preservedKeys: [],
      addedKeys: [entryKey],
      mergedDocument:
        rootKey === null ? { [entryKey]: entry } : { [rootKey]: { [entryKey]: entry } },
      alreadyConfigured: false,
      problems: [],
    };
  }

  const parsed = parseConfigDocument(existing, adapter.format);
  if (!parsed.ok) {
    return {
      ...base,
      fileExisted: true,
      preservedKeys: [],
      addedKeys: [],
      mergedDocument: null,
      alreadyConfigured: false,
      problems: [
        `the existing config file is not valid ${adapter.format ?? "json"} — refusing to modify it (never clobber)`,
      ],
    };
  }
  const document = parsed.value;
  if (!isConfigObject(document)) {
    return {
      ...base,
      fileExisted: true,
      preservedKeys: [],
      addedKeys: [],
      mergedDocument: null,
      alreadyConfigured: false,
      problems: [
        `the existing config file is not a ${adapter.format ?? "json"} object — refusing to modify it (never clobber)`,
      ],
    };
  }

  // Top-level map mode (e.g. the MCP server index): the tool is one key of the
  // document; every other key is an unrelated registration that is preserved.
  if (rootKey === null) {
    const current = document[entryKey];
    if (current !== undefined && deepEqualConfiguration(current, entry)) {
      return {
        ...base,
        fileExisted: true,
        preservedKeys: Object.keys(document).filter((key) => key !== entryKey),
        addedKeys: [],
        mergedDocument: document,
        alreadyConfigured: true,
        problems: [],
      };
    }
    return {
      ...base,
      fileExisted: true,
      preservedKeys: Object.keys(document).filter((key) => key !== entryKey),
      addedKeys: [entryKey],
      mergedDocument: { ...document, [entryKey]: entry },
      alreadyConfigured: false,
      problems: [],
    };
  }

  // Nested section mode (agent settings files): the adapter manages one
  // top-level section (e.g. `mcpServers`); every other top-level key is
  // preserved; the section itself must be an object.
  const section = document[rootKey];
  if (section !== undefined && !isConfigObject(section)) {
    return {
      ...base,
      fileExisted: true,
      preservedKeys: [],
      addedKeys: [],
      mergedDocument: null,
      alreadyConfigured: false,
      problems: [
        `config key '${rootKey}' already exists but is not an object — refusing to modify it (never clobber)`,
      ],
    };
  }
  const sectionObject = section === undefined ? {} : section;
  const current = sectionObject[entryKey];
  if (current !== undefined && deepEqualConfiguration(current, entry)) {
    return {
      ...base,
      fileExisted: true,
      preservedKeys: Object.keys(document).filter((key) => key !== rootKey),
      addedKeys: [],
      mergedDocument: document,
      alreadyConfigured: true,
      problems: [],
    };
  }
  return {
    ...base,
    fileExisted: true,
    preservedKeys: Object.keys(document).filter((key) => key !== rootKey),
    addedKeys: [entryKey],
    mergedDocument: {
      ...document,
      [rootKey]: { ...sectionObject, [entryKey]: entry },
    },
    alreadyConfigured: false,
    problems: [],
  };
}

/**
 * Apply a planned change to disk: **back up the existing file first**, write
 * the merged document, then **verify** by re-reading and comparing the tool
 * entry. On a write or verification failure the previous state is restored
 * (best-effort rollback) — created files are removed, existed files are copied
 * back from the backup. Blocked (`problems`) and already-configured changes
 * are never touched.
 */
export async function applyConfigurationChange(
  adapter: ConfigurationAdapter,
  ctx: ConfigurationContext,
  change: ConfigurationChange,
  writer: ConfigWriter,
  nowString: string,
): Promise<Result<{ readonly change: ConfigurationChange }>> {
  if (change.problems.length > 0) {
    return fail(new ConfigMergeError(change.filePath, change.problems));
  }
  if (change.alreadyConfigured || change.mergedDocument === null) {
    return ok({ change });
  }

  const backupPath = change.fileExisted ? backupPathFor(change.filePath, nowString) : null;
  if (backupPath !== null) {
    const backedUp = await writer.copy(change.filePath, backupPath);
    if (!backedUp.ok) {
      return fail(new ConfigWriteError(change.filePath, backedUp.error));
    }
  }

  const contentResult = await contentToWrite(adapter, ctx, change, writer);
  if (!contentResult.ok) {
    await rollbackConfiguration(change.filePath, backupPath, change.fileExisted, writer);
    return fail(contentResult.error);
  }

  const written = await writer.write(change.filePath, contentResult.value);
  if (!written.ok) {
    await rollbackConfiguration(change.filePath, backupPath, change.fileExisted, writer);
    return fail(new ConfigWriteError(change.filePath, written.error));
  }

  const expectedEntry = entryFromDocument(
    change.mergedDocument,
    adapter.rootKey(ctx),
    ctx.toolName,
  );
  const verification = await verifyConfigurationEntry(adapter, ctx, expectedEntry, writer);
  if (!verification.ok) {
    await rollbackConfiguration(change.filePath, backupPath, change.fileExisted, writer);
    return fail(verification.error);
  }

  return ok({
    change: { ...change, backupPath, verified: { ok: true, detail: verification.value.detail } },
  });
}

/**
 * Verify the tool entry is actually in the written file: re-read it through
 * the writer and compare the entry against the exact value embedded in the
 * changed document (the value that was written), so a partial/corrupt write is
 * caught — the check is "tool discoverable/runnable by the agent".
 */
export async function verifyConfigurationEntry(
  adapter: ConfigurationAdapter,
  ctx: ConfigurationContext,
  expectedEntry: unknown,
  writer: ConfigWriter,
): Promise<Result<{ readonly detail: string }>> {
  const filePath = adapter.configPath(ctx);
  const rootKey = adapter.rootKey(ctx);
  const read = await writer.read(filePath);
  if (!read.ok) {
    return fail(new ConfigVerifyError(filePath, read.error.message));
  }
  if (read.value === null) {
    return fail(new ConfigVerifyError(filePath, "the config file is missing after the write"));
  }
  const parsed = parseConfigDocument(read.value, adapter.format);
  if (!parsed.ok) {
    return fail(new ConfigVerifyError(filePath, parsed.error.message));
  }
  if (!isConfigObject(parsed.value)) {
    return fail(
      new ConfigVerifyError(
        filePath,
        `the written config is not a ${adapter.format ?? "json"} object`,
      ),
    );
  }
  const actual = entryFromDocument(parsed.value, rootKey, ctx.toolName);
  if (!deepEqualConfiguration(actual, expectedEntry)) {
    return fail(
      new ConfigVerifyError(
        filePath,
        `the written config does not contain the expected '${ctx.toolName}' entry`,
      ),
    );
  }
  return ok({ detail: `re-read ${filePath} and found the '${ctx.toolName}' entry` });
}

/**
 * Extract the value stored under `rootKey[entryKey]` (or `[entryKey]` when
 * `rootKey` is `null`) from a config document; `undefined` when absent.
 */
export function entryFromDocument(
  document: Readonly<Record<string, unknown>>,
  rootKey: string | null,
  entryKey: string,
): unknown {
  if (rootKey === null) {
    return document[entryKey];
  }
  const section = document[rootKey];
  if (!isConfigObject(section)) {
    return undefined;
  }
  return section[entryKey];
}

/** Restore the pre-change state: copy the backup back, or remove a created
 *  file. Best-effort — the caller reports the original failure regardless. */
export async function rollbackConfiguration(
  path: string,
  backupPath: string | null,
  fileExisted: boolean,
  writer: ConfigWriter,
): Promise<void> {
  if (backupPath !== null) {
    await writer.copy(backupPath, path);
    return;
  }
  if (!fileExisted) {
    await writer.remove(path);
  }
}

/** Parse a user-config file in the adapter's on-disk format. */
export function parseConfigDocument(raw: string, format?: ConfigFormat): Result<unknown> {
  if (format === "toml") return parseTomlDocument(raw);
  if (format === "jsonc") return parseJsonc(raw);
  try {
    return ok(JSON.parse(raw) as unknown);
  } catch (error) {
    return fail(new Error(error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Serialize a merged document the way CodeAtlas writes its own JSON state
 * (2-space indent + trailing newline — the Scanner/Tool-Manifest convention).
 * For `"toml"` the document is rendered back to TOML; `"jsonc"` files are
 * written as plain JSON (JSON is valid JSONC). Note: `applyConfigurationChange`
 * does **not** use this for TOML — it performs a surgical, comment-preserving
 * section merge instead (see {@link contentToWrite}).
 */
export function serializeConfigDocument(
  document: Readonly<Record<string, unknown>>,
  format?: ConfigFormat,
): string {
  if (format === "toml") return serializeTomlDocument(document);
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Resolve the exact text to write for an applied change. For `"toml"` targets
 * the merged text is produced by a surgical section merge against the current
 * on-disk content (comments and unrelated tables preserved byte-for-byte); for
 * JSON/JSONC the merged document is serialized.
 */
async function contentToWrite(
  adapter: ConfigurationAdapter,
  ctx: ConfigurationContext,
  change: ConfigurationChange,
  writer: ConfigWriter,
): Promise<Result<string>> {
  const format = adapter.format ?? "json";
  if (format !== "toml") {
    if (change.mergedDocument === null) {
      return fail(new ConfigMergeError(change.filePath, change.problems));
    }
    return ok(serializeConfigDocument(change.mergedDocument, format));
  }
  const rootKey = adapter.rootKey(ctx);
  if (rootKey === null) {
    return fail(new ConfigMergeError(change.filePath, ["TOML targets need a section key"]));
  }
  const original = change.fileExisted ? await writer.read(change.filePath) : ok(null);
  if (!original.ok) {
    return fail(new ConfigReadError(change.filePath, original.error));
  }
  const entry =
    change.mergedDocument === null
      ? adapter.buildEntry(ctx)
      : ((entryFromDocument(change.mergedDocument, rootKey, ctx.toolName) as
          | Readonly<Record<string, unknown>>
          | undefined) ?? adapter.buildEntry(ctx));
  const merged = mergeTomlSection(original.value, rootKey, ctx.toolName, entry);
  if (!merged.ok) return fail(merged.error);
  return ok(merged.value.text);
}

/** An fs-safe backup file name for a config file, from an ISO timestamp. */
export function backupPathFor(filePath: string, nowString: string): string {
  const stamp = nowString.replace(/[^0-9A-Za-z]/g, "");
  return `${filePath}.${stamp}.bak`;
}

/** Whether a JSON value is a plain object (not an array, not `null`). */
export function isConfigObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep structural equality (key order independent) for config entries. */
export function deepEqualConfiguration(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

/** Convenience: the raw config content for a target via a {@link ConfigWriter}. */
export async function readConfiguration(
  adapter: ConfigurationAdapter,
  ctx: ConfigurationContext,
  writer: ConfigWriter,
): Promise<Result<string | null>> {
  return writer.read(adapter.configPath(ctx));
}

/** Convenience: the config path for a target under a config home. */
export function configPathFor(
  ctx: ConfigurationContext,
  dirName: string | null,
  fileName: string,
): string {
  return dirName === null
    ? join(ctx.configHome, fileName)
    : join(ctx.configHome, dirName, fileName);
}
