import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { URL } from "node:url";
import type { BrowseEvidence, BrowseInteraction, BrowsePort, BrowseViewport } from "@atlas/core";
import { fail, ok } from "@atlas/shared";
import { findExecutable } from "@atlas/toolkit";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_CHARS = 128 * 1024;
const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
/** Hard cap on interactions per call — research, not crawling. */
const MAX_INTERACTIONS = 12;
/** Hard cap on fill text length — page data stays bounded. */
const MAX_FILL_LENGTH = 200;
const DEFAULT_VIEWPORTS: readonly BrowseViewport[] = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];
/** playwright-cli subcommands the interact op may invoke. Never extended by input. */
/** Allowed named keys for `press` (single characters are validated separately). */
const NAMED_KEYS = new Set<string>([
  "Enter",
  "Escape",
  "Tab",
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
]);

export interface BrowseRunnerResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export type BrowseRunner = (
  binary: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
) => Promise<BrowseRunnerResult>;

export interface BrowseServiceOptions {
  readonly repositoryPath?: string;
  readonly allowOrigins?: readonly string[];
  readonly resolveBinary?: () => string | null;
  readonly runner?: BrowseRunner;
  readonly timeoutMs?: number;
  readonly maxOutputChars?: number;
}

export interface BrowseService extends BrowsePort {
  readonly defaultViewports: readonly BrowseViewport[];
}

/** Path-safe evidence label: `[a-zA-Z0-9._-]`, 1–64 chars, no leading dot. */
export function isValidEvidenceLabel(label: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(label);
}

export function createBrowseService(options: BrowseServiceOptions = {}): BrowseService {
  const repositoryPath = resolve(options.repositoryPath ?? process.cwd());
  const evidenceDirectory = join(repositoryPath, ".codeatlas", "evidence");
  const resolveBinary = options.resolveBinary ?? (() => findExecutable("playwright-cli"));
  const runner = options.runner ?? runProcess;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputChars = options.maxOutputChars ?? MAX_OUTPUT_CHARS;
  const allowOrigins = new Set(options.allowOrigins ?? []);

  const authorize = (rawUrl: string): URL | Error => {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return new Error(`Invalid URL: ${rawUrl}`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return new Error("Browse URL must use http or https.");
    }
    if (!allowOrigins.has(url.origin)) {
      return new Error(
        `Origin is not allowlisted: ${url.origin}. Re-run with --allow-origin ${url.origin}.`,
      );
    }
    return url;
  };

  /**
   * Validate a caller-supplied evidence label. Returns the validated label, or
   * an Error describing the problem. Labels become part of evidence filenames,
   * so they must be path-safe and bounded.
   */
  const checkLabel = (label: string | undefined): string | Error => {
    if (label === undefined) return "";
    if (typeof label !== "string" || !isValidEvidenceLabel(label)) {
      return new Error(
        "Evidence label must be 1-64 characters of [a-zA-Z0-9._-], starting with a letter or digit.",
      );
    }
    return label;
  };

  /**
   * Build the filename-safe label segment for evidence names. Empty label ->
   * empty segment (no leading dash when unused).
   */
  const labelSegment = (label: string): string => (label === "" ? "" : `-${label}`);

  /**
   * Encode a page-derived value into bounded, argument-array-safe strings for
   * the fixed vocabulary. Everything here ends up as a single argv entry passed
   * to `spawn(..., { shell: false })` — it is data, never a shell string.
   */
  const encodeInteractions = (
    interactions: readonly BrowseInteraction[],
  ): readonly (readonly string[])[] | Error => {
    if (interactions.length === 0) {
      return new Error("interact requires at least one interaction.");
    }
    if (interactions.length > MAX_INTERACTIONS) {
      return new Error(`interact accepts at most ${MAX_INTERACTIONS} interactions per call.`);
    }
    const commands: string[][] = [];
    for (const interaction of interactions) {
      if (interaction === null || typeof interaction !== "object") {
        return new Error("Each interaction must be an object with a known kind.");
      }
      switch (interaction.kind) {
        case "click":
        case "hover": {
          const ref = interaction.ref;
          if (typeof ref !== "string" || ref.length === 0 || ref.length > 64) {
            return new Error(
              `Interaction "${interaction.kind}" requires a snapshot element ref (1-64 chars).`,
            );
          }
          commands.push([interaction.kind, ref]);
          break;
        }
        case "fill": {
          const ref = interaction.ref;
          const text = interaction.text;
          if (typeof ref !== "string" || ref.length === 0 || ref.length > 64) {
            return new Error('Interaction "fill" requires a snapshot element ref (1-64 chars).');
          }
          if (typeof text !== "string" || text.length === 0 || text.length > MAX_FILL_LENGTH) {
            return new Error(`Interaction "fill" text must be 1-${MAX_FILL_LENGTH} characters.`);
          }
          commands.push(["fill", ref, text]);
          break;
        }
        case "press": {
          const key = interaction.key;
          const isNamed = NAMED_KEYS.has(String(key));
          const isSingleChar =
            typeof key === "string" && key.length === 1 && /[a-zA-Z0-9]$/.test(key);
          if (!isNamed && !isSingleChar) {
            return new Error(
              'Interaction "press" accepts a single alphanumeric character or a fixed key (Enter, Escape, Tab, ArrowDown, ArrowUp, ArrowLeft, ArrowRight).',
            );
          }
          commands.push(["press", String(key)]);
          break;
        }
        default:
          return new Error(
            "Unknown interaction kind. Supported: click, hover, fill, press with snapshot element refs.",
          );
      }
    }
    return commands;
  };

  const execute = async (
    operation: BrowseEvidence["operation"],
    rawUrl: string,
    commands: readonly (readonly string[])[],
    viewport: BrowseViewport | undefined,
    extension: string,
    label = "",
  ) => {
    const parsed = authorize(rawUrl);
    if (parsed instanceof Error) return fail(parsed);
    const binary = resolveBinary();
    if (binary === null)
      return fail(new Error("playwright-cli is not installed or not available on PATH."));
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      return fail(
        new Error(`Browse timeout must be an integer between 1 and ${MAX_TIMEOUT_MS} ms.`),
      );
    }

    await mkdir(evidenceDirectory, { recursive: true });
    const filename = `${Date.now()}-${operation}${labelSegment(label)}-${Math.random()
      .toString(36)
      .slice(2, 10)}${extension}`;
    const path = join(evidenceDirectory, filename);
    const results: BrowseRunnerResult[] = [];
    const steps: readonly (readonly string[])[] = [[], ...commands];
    for (const [index, command] of steps.entries()) {
      const args =
        index === 0 ? ["open", parsed.toString(), "--browser", "chromium"] : [...command];
      if (index === steps.length - 1 && extension.length > 0) args.push(`--filename=${path}`);
      const result = await runner(binary, args, repositoryPath, timeoutMs);
      results.push(result);
      if (result.timedOut || result.exitCode !== 0) break;
    }
    const output = truncate(
      results
        .map((result) => `${result.stdout}${result.stderr.length > 0 ? `\n${result.stderr}` : ""}`)
        .join("\n"),
      maxOutputChars,
    );
    const finalResult = results[results.length - 1];
    const okResult =
      results.length === steps.length &&
      finalResult !== undefined &&
      !finalResult.timedOut &&
      finalResult.exitCode === 0;
    let savedPath: string | null = null;
    if (okResult && extension.length > 0) {
      // Read only the path generated above; never trust a path returned by the browser process.
      try {
        const target = resolve(path);
        const evidenceRoot = resolve(evidenceDirectory);
        if (target.startsWith(`${evidenceRoot}/`) || target.startsWith(`${evidenceRoot}\\`)) {
          const bytes = await readFile(target);
          if (bytes.byteLength <= MAX_EVIDENCE_BYTES) savedPath = target;
          else await rm(target, { force: true });
        }
      } catch {
        // Raw command output remains useful when the optional artifact is unavailable.
      }
    }
    return ok({
      operation,
      url: parsed.toString(),
      ...(viewport === undefined ? {} : { viewport }),
      ...(label === "" ? {} : { label }),
      path: savedPath,
      output,
      ok: okResult,
    });
  };

  return {
    defaultViewports: DEFAULT_VIEWPORTS,
    snapshot: (url, label) => {
      const checked = checkLabel(label);
      return checked instanceof Error
        ? Promise.resolve(fail(checked))
        : execute("snapshot", url, [["snapshot"]], undefined, ".txt", checked);
    },
    screenshot: (url, viewport, label) => {
      const checked = checkLabel(label);
      if (checked instanceof Error) return Promise.resolve(fail(checked));
      const selected = viewport ?? DEFAULT_VIEWPORTS[0];
      return execute(
        "screenshot",
        url,
        [["resize", String(selected.width), String(selected.height)], ["screenshot"]],
        selected,
        ".png",
        checked,
      );
    },
    console: (url, label) => {
      const checked = checkLabel(label);
      return checked instanceof Error
        ? Promise.resolve(fail(checked))
        : execute("console", url, [["console"]], undefined, "", checked);
    },
    responsive: async (url, viewports, label) => {
      const checked = checkLabel(label);
      if (checked instanceof Error) return Promise.resolve(fail(checked));
      const selected = viewports.length > 0 ? viewports : DEFAULT_VIEWPORTS;
      const results = [];
      for (const viewport of selected) {
        const result = await execute(
          "responsive",
          url,
          [["resize", String(viewport.width), String(viewport.height)], ["screenshot"]],
          viewport,
          ".png",
          checked,
        );
        if (!result.ok) return result;
        results.push(result.value);
      }
      return ok(results);
    },
    interact: async (url, interactions, options = {}) => {
      const checked = checkLabel(options.label);
      if (checked instanceof Error) return fail(checked);
      const encoded = encodeInteractions(interactions);
      if (encoded instanceof Error) return fail(encoded);
      const selected = options.viewport ?? DEFAULT_VIEWPORTS[0];
      return execute(
        "interact",
        url,
        [["resize", String(selected.width), String(selected.height)], ...encoded, ["snapshot"]],
        selected,
        ".txt",
        checked,
      );
    },
  };
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}\n[output truncated]` : value;
}

async function runProcess(
  binary: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<BrowseRunnerResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(binary, [...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const append = (current: string, chunk: Buffer) =>
      truncate(current + chunk.toString("utf8"), MAX_OUTPUT_CHARS);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`playwright-cli process failed to start: ${error.message}`));
      }
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolveResult({ exitCode, signal, timedOut, stdout, stderr });
      }
    });
  });
}
