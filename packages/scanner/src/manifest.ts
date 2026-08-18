import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ProjectScan } from "@atlas/core";
import { VERSION } from "@atlas/shared";
import { type Result, fail, ok } from "@atlas/shared";

/** Schema version of the manifest. Bump when the shape changes. */
export const MANIFEST_VERSION = 1;

/** Directory (relative to the project root) that stores manifest artifacts. */
export const MANIFEST_DIR_NAME = ".codeatlas";

/** File name of the project manifest inside {@link MANIFEST_DIR_NAME}. */
export const MANIFEST_FILE_NAME = "manifest.json";

/** Package managers the manifest can report. */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";

/** VCS information captured from the project. */
export interface GitInfo {
  readonly isRepository: boolean;
  /** Current branch name, or `null` when unavailable/not a repo. */
  readonly branch: string | null;
  /** Current HEAD commit hash, or `null` when unavailable. */
  readonly commit: string | null;
  /** Origin remote URL, or `null` when unavailable. */
  readonly remoteUrl: string | null;
}

/** The on-disk project manifest. */
export interface ProjectManifest {
  /** Schema version for future migrations. See {@link MANIFEST_VERSION}. */
  readonly manifestVersion: number;
  readonly name: string;
  readonly languages: readonly string[];
  readonly framework: string | null;
  readonly packageManager: PackageManager | null;
  readonly git: GitInfo;
  /** ISO-8601 timestamp of first creation (preserved across updates). */
  readonly createdAt: string;
  /** ISO-8601 timestamp of the most recent update. */
  readonly updatedAt: string;
  readonly scannerVersion: string;
  readonly totalFiles: number;
  readonly totalFolders: number;
}

/** Options for {@link generateManifest}. */
export interface ManifestOptions {
  /** Absolute path of the project root (where `.codeatlas/` is created). */
  readonly rootPath: string;
  /** Scanner version recorded in the manifest. Defaults to the SDK version. */
  readonly scannerVersion?: string;
  /** Injectable clock for deterministic output and tests. */
  readonly now?: Date;
}

/** The result of generating a manifest. */
export interface GeneratedManifest {
  readonly manifest: ProjectManifest;
  /** Absolute path of the written manifest file. */
  readonly path: string;
}

const execFileAsync = promisify(execFile);

/** Run a git command and return trimmed stdout, or `null` on any failure. */
async function git(args: readonly string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: 3000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Detect the package manager from the presence of lockfiles in the project
 * root.
 *
 * @param rootEntries - Names of entries in the project root directory.
 * @returns The detected {@link PackageManager}, or `null` when none is found.
 */
export function detectPackageManager(rootEntries: readonly string[]): PackageManager | null {
  if (rootEntries.includes("pnpm-lock.yaml")) return "pnpm";
  if (rootEntries.includes("yarn.lock")) return "yarn";
  if (rootEntries.includes("bun.lockb") || rootEntries.includes("bun.lock")) {
    return "bun";
  }
  if (rootEntries.includes("package-lock.json")) return "npm";
  if (rootEntries.includes("deno.lock") || rootEntries.includes("deno.json")) {
    return "deno";
  }
  if (rootEntries.includes("package.json")) return "npm";
  return null;
}

/**
 * Capture VCS information for a project root.
 *
 * @param root - Absolute project root.
 * @param isRepository - Whether the scanner detected `.git`.
 * @returns The {@link GitInfo}. Git commands that fail (e.g. git not
 *   installed) fall back to `null` rather than throwing.
 */

/**
 * Generate (or update) the project manifest at
 * `<root>/.codeatlas/manifest.json` from a fresh {@link ProjectScan}.
 *
 * Merge policy ("do not overwrite existing values unnecessarily"):
 * - `createdAt` is preserved from an existing manifest and only set on first
 *   creation.
 * - `updatedAt` is always refreshed to the current time.
 * - Remaining fields are recomputed from the latest scan/signals so they never
 *   go stale.
 *
 * @param scan - The structured scan produced by the scanner.
 * @param options - Root path and optional overrides (version / clock).
 * @returns A {@link Result} wrapping the written {@link GeneratedManifest}, or
 *   a failure when writing fails.
 */
export async function generateManifest(
  scan: ProjectScan,
  options: ManifestOptions,
): Promise<Result<GeneratedManifest>> {
  const root = resolve(options.rootPath);
  const directory = join(root, MANIFEST_DIR_NAME);
  const path = join(directory, MANIFEST_FILE_NAME);
  const now = (options.now ?? new Date()).toISOString();
  const scannerVersion = options.scannerVersion ?? VERSION;

  let rootEntries: readonly string[] = [];
  try {
    rootEntries = await readdir(root);
  } catch {
    rootEntries = [];
  }

  const packageManager = detectPackageManager(rootEntries);
  const git = await collectGitInfo(root, scan.isGitRepository);

  const existing = await loadManifest(path);
  const existingValue = existing.ok && existing.value !== null ? existing.value : null;
  const createdAt = existingValue?.createdAt ?? now;

  const manifest: ProjectManifest = {
    manifestVersion: MANIFEST_VERSION,
    name: scan.name,
    languages: scan.languages.map((language) => language.name),
    framework: scan.framework,
    packageManager,
    git,
    createdAt,
    updatedAt: now,
    scannerVersion,
    totalFiles: scan.totalFiles,
    totalFolders: scan.totalFolders,
  };

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return ok({ manifest, path });
  } catch (error) {
    return fail(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function collectGitInfo(root: string, isRepository: boolean): Promise<GitInfo> {
  if (!isRepository) {
    return { isRepository: false, branch: null, commit: null, remoteUrl: null };
  }
  const [branch, commit, remoteUrl] = await Promise.all([
    git(["branch", "--show-current"], root),
    git(["rev-parse", "HEAD"], root),
    git(["remote", "get-url", "origin"], root),
  ]);
  return { isRepository: true, branch, commit, remoteUrl };
}

/**
 * Load an existing manifest from disk if present and valid.
 *
 * @param manifestPath - Absolute path to the manifest file.
 * @returns A {@link Result} wrapping the parsed manifest, or `null` when the
 *   file is absent or malformed (callers may then regenerate).
 */
export async function loadManifest(manifestPath: string): Promise<Result<ProjectManifest | null>> {
  if (!existsSync(manifestPath)) {
    return ok(null);
  }
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return ok(parsed as ProjectManifest);
    }
    return ok(null);
  } catch {
    return ok(null);
  }
}
