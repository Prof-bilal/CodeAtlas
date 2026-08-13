import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

/** Repository root of the CodeAtlas monorepo (where tests run from). */
export const MONOREPO_ROOT = resolve(process.cwd());

/** The real external repository used as the test subject. */
export const REPO_PATH = resolve(process.cwd(), "test-repo", "AIbuilder");

/** The repository's on-disk CodeAtlas index directory. */
export const CODEATLAS_DIR = join(REPO_PATH, ".codeatlas");

/** On-disk context database for the repository. */
export const CONTEXT_DB = join(CODEATLAS_DIR, "context.db");

/** Results directory for machine-readable test output. */
export const RESULTS_DIR = resolve(process.cwd(), "tests", "integration", "results");

/** The built CLI entry (bundled by tsup from `apps/cli/src`). */
export function cliPath(): string {
  const path = resolve(process.cwd(), "apps", "cli", "dist", "index.js");
  if (!existsSync(path)) {
    throw new Error(
      `Built CLI not found at ${path}. Run \`pnpm --filter codeatlas-cli build\` first.`,
    );
  }
  return path;
}

export interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly durationMs: number;
}

const runFile = promisify(execFile);

/**
 * Run the real CodeAtlas CLI as a subprocess and return its output, exit code,
 * and wall-clock duration. `ATLAS_ROOT` pins the target repository so CLI
 * commands operate on the external AI Builder fixture, never the monorepo cwd.
 */
export async function runCli(args: readonly string[], timeoutMs = 300_000): Promise<CliResult> {
  const started = performance.now();
  try {
    const { stdout, stderr } = await runFile(process.execPath, [cliPath(), ...args], {
      cwd: MONOREPO_ROOT,
      env: { ...process.env, ATLAS_ROOT: REPO_PATH },
      timeout: timeoutMs,
    });
    return {
      stdout: stdout ?? "",
      stderr: stderr ?? "",
      code: 0,
      durationMs: performance.now() - started,
    };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: err.code ?? 1,
      durationMs: performance.now() - started,
    };
  }
}

/** Path-relative helper: repository-relative display path for a file. */
export function rel(path: string): string {
  return path.replace(/\\/g, "/").replace(new RegExp(`^${REPO_PATH.replace(/\\/g, "/")}/`), "");
}

/** Ensure the results directory exists. */
export async function ensureResultsDir(): Promise<void> {
  await mkdir(RESULTS_DIR, { recursive: true });
}

/** Write a machine-readable result JSON to `tests/integration/results/`. */
export async function writeResult(name: string, data: Record<string, unknown>): Promise<string> {
  await ensureResultsDir();
  const path = join(RESULTS_DIR, `${name}.json`);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return path;
}

/** True when the repository exists on disk (integration fixture present). */
export function repositoryPresent(): boolean {
  return existsSync(join(REPO_PATH, "package.json"));
}

/** Remove the repository's `.codeatlas` directory (test cleanup). */
export async function removeCodeAtlas(): Promise<void> {
  await rm(CODEATLAS_DIR, { recursive: true, force: true });
}

/** Restore a previously-saved file (or remove it) after a mutation test. */
export async function restoreFile(path: string, saved: string | null): Promise<void> {
  if (saved === null) {
    await rm(path, { force: true });
  } else {
    await writeFile(path, saved, "utf8");
  }
}

/** Snapshot a file's content so a mutation test can restore it later. */
export function snapshotFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Display name of the repository for reports. */
export const REPO_NAME = basename(REPO_PATH);
