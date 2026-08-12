import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ToolInstallMethodType } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { ManifestError, ManifestLoadError, ManifestValidationError } from "./errors";
import {
  DEFAULT_MANIFEST_COMPATIBILITY,
  DEFAULT_MANIFEST_CONFIGURATION,
  DEFAULT_MANIFEST_INTEGRATION_STATE,
  DEFAULT_MANIFEST_SECURITY,
  DEFAULT_MANIFEST_VERIFICATION,
  TOOL_MANIFEST_SCHEMA_VERSION,
  type ToolManifest,
  type ToolManifestCompatibility,
  type ToolManifestConfiguration,
  type ToolManifestInstallation,
  type ToolManifestIntegrationState,
  type ToolManifestProvenance,
  type ToolManifestSecurity,
  type ToolManifestVerification,
  parseToolManifest,
  serializeToolManifest,
  validateToolManifest,
} from "./manifest-schema";

/** The `.codeatlas/` directory at the project root (same name the Scanner uses). */
export const MANIFEST_DIR_NAME = ".codeatlas";

/** Sub-directory inside `.codeatlas/` holding one manifest per installed tool. */
export const TOOL_MANIFESTS_DIR_NAME = "tools";

/** Extension of a per-tool manifest file. */
export const TOOL_MANIFEST_FILE_EXTENSION = ".json";

/**
 * Upper bound on the size of a manifest file. Manifests are untrusted input;
 * a hostile file must not be able to exhaust memory at load time.
 */
export const MAX_TOOL_MANIFEST_BYTES = 1024 * 1024;

/** Tool names that map to safe file names (no separators, no traversal). */
const SAFE_TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Whether `name` is safe to use as a manifest file name. */
export function isValidToolName(name: string): boolean {
  return SAFE_TOOL_NAME.test(name);
}

/**
 * The on-disk path of a tool's manifest: `<root>/.codeatlas/tools/<name>.json`.
 * Throws a {@link ManifestValidationError} for names that are not safe file
 * names, so untrusted tool names can never escape the `.codeatlas/tools/`
 * directory.
 */
export function toolManifestPath(root: string, name: string): string {
  if (!isValidToolName(name)) {
    throw new ManifestValidationError(name, [
      "name is not a safe file name (must match [A-Za-z0-9][A-Za-z0-9._-]*)",
    ]);
  }
  return join(
    root,
    MANIFEST_DIR_NAME,
    TOOL_MANIFESTS_DIR_NAME,
    `${name}${TOOL_MANIFEST_FILE_EXTENSION}`,
  );
}

/** Inputs for {@link createToolManifest}. Only the identity fields and the
 *  installation requirement are mandatory; everything else defaults to an
 *  honest "not yet recorded" state. */
export interface CreateToolManifestInput {
  readonly name: string;
  readonly description: string;
  readonly toolVersion: string;
  readonly license: string;
  readonly installation: ToolManifestInstallationInput;
  readonly repository?: string | null;
  readonly categories?: readonly string[];
  readonly supportedAgents?: readonly string[];
  readonly documentation?: string | null;
  readonly compatibility?: ToolManifestCompatibility;
  readonly configuration?: ToolManifestConfiguration;
  readonly security?: ToolManifestSecurity;
  readonly provenance?: ToolManifestProvenance;
  readonly verification?: ToolManifestVerification;
  readonly integrationState?: ToolManifestIntegrationState;
  readonly extra?: Readonly<Record<string, unknown>>;
}

/**
 * A convenience input shape for the installation requirement: every field
 * except `type` is optional and defaults to `null` (the schema normalizes it).
 */
export interface ToolManifestInstallationInput {
  readonly type: ToolInstallMethodType;
  readonly package?: string | null;
  readonly source?: string | null;
  readonly checksum?: string | null;
  readonly versionRange?: string | null;
  readonly note?: string | null;
}

/** Options for {@link createToolManifest}. */
export interface CreateToolManifestOptions {
  /** Injectable clock for deterministic output and tests. */
  readonly now?: Date;
}

/**
 * Build a fresh {@link ToolManifest} for a newly installed tool, filling
 * defaults (unverified security/trust/verification, unknown integration state,
 * manual provenance) and stamping `installedAt`/`updatedAt`. Validates the
 * result (normalizing the partial installation input) and throws a
 * {@link ManifestValidationError} on invalid input.
 */
export function createToolManifest(
  input: CreateToolManifestInput,
  options: CreateToolManifestOptions = {},
): ToolManifest {
  const now = (options.now ?? new Date()).toISOString();
  const manifest: ToolManifest = {
    schemaVersion: TOOL_MANIFEST_SCHEMA_VERSION,
    name: input.name,
    description: input.description,
    toolVersion: input.toolVersion,
    repository: input.repository ?? null,
    license: input.license,
    categories: input.categories ?? [],
    supportedAgents: input.supportedAgents ?? [],
    documentation: input.documentation ?? null,
    compatibility: input.compatibility ?? DEFAULT_MANIFEST_COMPATIBILITY,
    installation: normalizeInstallation(input.installation),
    configuration: input.configuration ?? DEFAULT_MANIFEST_CONFIGURATION,
    security: input.security ?? DEFAULT_MANIFEST_SECURITY,
    provenance: input.provenance ?? {
      source: "manual",
      sourceRef: null,
      method: input.installation.type,
      command: null,
      recordedAt: now,
    },
    verification: input.verification ?? DEFAULT_MANIFEST_VERIFICATION,
    integrationState: input.integrationState ?? DEFAULT_MANIFEST_INTEGRATION_STATE,
    installedAt: now,
    updatedAt: now,
    extra: input.extra ?? {},
  };
  const validation = validateToolManifest(manifest);
  if (!validation.ok) {
    throw validation.error;
  }
  return validation.value;
}

function normalizeInstallation(input: ToolManifestInstallationInput): ToolManifestInstallation {
  return {
    type: input.type,
    package: input.package ?? null,
    source: input.source ?? null,
    checksum: input.checksum ?? null,
    versionRange: input.versionRange ?? null,
    note: input.note ?? null,
  };
}

/** The result of saving a manifest. */
export interface SavedToolManifest {
  readonly manifest: ToolManifest;
  /** Absolute path of the written manifest file. */
  readonly path: string;
}

/** Options for {@link saveToolManifest}. */
export interface SaveToolManifestOptions {
  /** Injectable clock for deterministic output and tests. */
  readonly now?: Date;
}

/**
 * Write one tool's manifest to `<root>/.codeatlas/tools/<name>.json`.
 *
 * Security: the manifest is validated **before any write** (untrusted input
 * never reaches disk unvalidated), and the tool name must be a safe file name
 * so it can never escape `.codeatlas/tools/`.
 *
 * Merge policy (mirrors the Scanner manifest): `installedAt` is preserved from
 * an existing manifest; `updatedAt` is refreshed to now; everything else is
 * written exactly as given.
 */
export async function saveToolManifest(
  root: string,
  manifest: ToolManifest,
  options: SaveToolManifestOptions = {},
): Promise<Result<SavedToolManifest>> {
  const validation = validateToolManifest(manifest);
  if (!validation.ok) {
    return fail(validation.error);
  }
  const validated = validation.value;
  let path: string;
  try {
    path = toolManifestPath(root, validated.name);
  } catch (error) {
    return fail(toError(error));
  }
  const now = (options.now ?? new Date()).toISOString();
  const existing = await loadToolManifest(path);
  const installedAt =
    existing.ok && existing.value !== null ? existing.value.installedAt : validated.installedAt;
  const updated: ToolManifest = { ...validated, installedAt, updatedAt: now };
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, serializeToolManifest(updated), "utf8");
    return ok({ manifest: updated, path });
  } catch (error) {
    return fail(toError(error));
  }
}

/**
 * Load and validate one tool's manifest from disk. The manifest is treated as
 * **untrusted input**: a missing file yields `ok(null)`, but present-and-invalid
 * content fails with a typed {@link ManifestError} (schema version mismatch,
 * validation failure, unreadable/oversized file) — never a crash.
 */
export async function loadToolManifest(path: string): Promise<Result<ToolManifest | null>> {
  if (!existsSync(path)) {
    return ok(null);
  }
  let size: number;
  try {
    size = statSync(path).size;
  } catch (error) {
    return fail(new ManifestLoadError(path, error));
  }
  if (size > MAX_TOOL_MANIFEST_BYTES) {
    return fail(
      new ManifestLoadError(path, new Error(`manifest exceeds ${MAX_TOOL_MANIFEST_BYTES} bytes`)),
    );
  }
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    return fail(new ManifestLoadError(path, error));
  }
  try {
    return ok(parseToolManifest(raw));
  } catch (error) {
    return fail(error instanceof ManifestError ? error : new ManifestLoadError(path, error));
  }
}

/**
 * List the names of installed tools by scanning `.codeatlas/tools/`. Returns
 * the safe file-name stem of every `.json` manifest present (validation of the
 * content happens per-file in {@link loadToolManifest}); an absent directory
 * yields an empty list.
 */
export async function listInstalledTools(root: string): Promise<Result<readonly string[]>> {
  const directory = join(root, MANIFEST_DIR_NAME, TOOL_MANIFESTS_DIR_NAME);
  if (!existsSync(directory)) {
    return ok([]);
  }
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    return fail(toError(error));
  }
  const names = entries
    .filter((entry) => entry.endsWith(TOOL_MANIFEST_FILE_EXTENSION))
    .map((entry) => entry.slice(0, -TOOL_MANIFEST_FILE_EXTENSION.length));
  return ok(names.filter(isValidToolName));
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
