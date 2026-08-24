import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContextSDK, scanProjectOverview } from "@atlas/sdk";
import { findRepositoryRoot } from "./config";
import { runProcess } from "./process";

/**
 * Community repository library + repository resolution.
 *
 * The curated list is a JSON file the operator can edit (config path is
 * configurable via `ATLAS_COMMUNITY_REPOS`). Two kinds of entries:
 *
 * - `local` — a directory that already exists on this machine (e.g. the pinned
 *   benchmark clones). No cloning, no network.
 * - `git` — a remote repository. Running a benchmark against it shallow-clones
 *   into an **isolated temporary workspace** that is always cleaned up.
 *
 * Nothing here hardcodes repository statistics: files/languages/size are read
 * from the real index or a real scan when needed, and availability is checked
 * live (filesystem for local entries, `git ls-remote` for remotes).
 */
export interface CommunityRepoEntry {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly url?: string | undefined;
  readonly source: "local" | "git";
  /** `local`: directory (absolute, or relative to the monorepo root). */
  readonly path?: string | undefined;
  /** `git`: clone URL. */
  readonly cloneUrl?: string | undefined;
  readonly branch?: string | undefined;
  /** Curation label — declares expected scale, never a measured statistic. */
  readonly difficulty?: "small" | "medium" | "large" | "extreme" | undefined;
  /** Declared primary languages (a curation hint, not a measurement). */
  readonly languages?: readonly string[] | undefined;
}

export interface CommunityConfig {
  readonly repositories: readonly CommunityRepoEntry[];
}

export class CommunityConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CommunityConfigError";
  }
}

function validateEntry(raw: unknown, index: number): CommunityRepoEntry {
  if (typeof raw !== "object" || raw === null) {
    throw new CommunityConfigError(`community repositories[${index}]: expected an object`);
  }
  const e = raw as Record<string, unknown>;
  const id = e["id"];
  if (typeof id !== "string" || id.trim() === "") {
    throw new CommunityConfigError(`community repositories[${index}]: missing "id"`);
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new CommunityConfigError(`community repositories[${index}]: invalid id "${id}"`);
  }
  const name = e["name"];
  if (typeof name !== "string" || name.trim() === "") {
    throw new CommunityConfigError(`community repositories[${index}]: missing "name"`);
  }
  const source = e["source"] === "git" ? "git" : e["source"] === "local" ? "local" : null;
  if (source === null) {
    throw new CommunityConfigError(
      `community repositories[${index}]: "source" must be "local" or "git"`,
    );
  }
  const path = e["path"];
  if (source === "local" && typeof path !== "string") {
    throw new CommunityConfigError(`community repositories[${index}]: local entry needs "path"`);
  }
  const cloneUrl = e["cloneUrl"];
  if (source === "git" && (typeof cloneUrl !== "string" || !/^https:\/\//i.test(cloneUrl))) {
    throw new CommunityConfigError(
      `community repositories[${index}]: git entry needs an https:// "cloneUrl"`,
    );
  }
  const description = e["description"];
  const url = e["url"];
  const branch = e["branch"];
  const difficultyRaw = e["difficulty"];
  const languagesRaw = e["languages"];
  return {
    id,
    name,
    description: typeof description === "string" ? description : undefined,
    url: typeof url === "string" ? url : undefined,
    source,
    path: typeof path === "string" ? path : undefined,
    cloneUrl: typeof cloneUrl === "string" ? cloneUrl : undefined,
    branch: typeof branch === "string" ? branch : undefined,
    difficulty:
      difficultyRaw === "small" ||
      difficultyRaw === "medium" ||
      difficultyRaw === "large" ||
      difficultyRaw === "extreme"
        ? difficultyRaw
        : undefined,
    languages: Array.isArray(languagesRaw)
      ? languagesRaw.filter((l): l is string => typeof l === "string")
      : undefined,
  };
}

/** Load and validate the community config (fail-loud on malformed input). */
export function loadCommunityConfig(path: string): CommunityConfig {
  if (!existsSync(path)) {
    throw new CommunityConfigError(`Community config not found at ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new CommunityConfigError(
      `Community config is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { repositories?: unknown }).repositories)
  ) {
    throw new CommunityConfigError('Community config must be { "repositories": [...] }');
  }
  const repositories = (parsed as { repositories: unknown[] }).repositories.map(validateEntry);
  const ids = new Set<string>();
  for (const r of repositories) {
    if (ids.has(r.id))
      throw new CommunityConfigError(`Duplicate community repository id "${r.id}"`);
    ids.add(r.id);
  }
  return { repositories };
}

/** Resolve a `local` entry's path (relative paths anchor at the monorepo root). */
export function localEntryPath(entry: CommunityRepoEntry): string {
  const raw = entry.path ?? "";
  return raw.startsWith("/") ? raw : join(findRepositoryRoot(), raw);
}

export interface Availability {
  readonly available: boolean;
  readonly checked: "local-fs" | "git-ls-remote";
  readonly detail?: string | undefined;
}

/** Live availability check — filesystem for local entries, `git ls-remote` for remotes. */
export async function checkAvailability(
  entry: CommunityRepoEntry,
  timeoutMs: number,
): Promise<Availability> {
  if (entry.source === "local") {
    const p = localEntryPath(entry);
    const available = existsSync(p) && statSync(p).isDirectory();
    return { available, checked: "local-fs", detail: available ? p : `path not found: ${p}` };
  }
  const res = await runProcess("git", ["ls-remote", "--heads", entry.cloneUrl ?? "", "HEAD"], {
    timeoutMs,
  });
  if (res.error !== undefined) {
    return {
      available: false,
      checked: "git-ls-remote",
      detail: `git not available: ${res.error}`,
    };
  }
  if (res.timedOut) {
    return { available: false, checked: "git-ls-remote", detail: "availability check timed out" };
  }
  return {
    available: res.ok,
    checked: "git-ls-remote",
    detail: res.ok ? undefined : res.stderr.trim().slice(0, 200),
  };
}

export interface ResolvedRepository {
  /** Absolute path of the repository working copy. */
  readonly path: string;
  readonly name: string;
  /** True when `path` is a temporary clone the caller must clean up. */
  readonly temporary: boolean;
  readonly entry?: CommunityRepoEntry;
}

export class RepositoryUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RepositoryUnavailableError";
  }
}

/** Resolve a community entry to a working copy (shallow-cloning remotes). */
export async function resolveRepository(
  entry: CommunityRepoEntry,
  timeoutMs: number,
): Promise<ResolvedRepository> {
  if (entry.source === "local") {
    const p = localEntryPath(entry);
    if (!existsSync(p) || !statSync(p).isDirectory()) {
      throw new RepositoryUnavailableError(
        `Local repository "${entry.id}" is not available (checked ${p})`,
      );
    }
    return { path: p, name: entry.name, temporary: false, entry };
  }
  const dir = mkdtempSync(join(tmpdir(), "atlas-community-"));
  const args = ["clone", "--depth", "1", "--single-branch"];
  if (entry.branch !== undefined) args.push("--branch", entry.branch);
  args.push(entry.cloneUrl ?? "", dir);
  const res = await runProcess("git", args, { timeoutMs });
  if (!res.ok) {
    rmSync(dir, { recursive: true, force: true });
    const reason = res.timedOut
      ? `clone timed out after ${Math.round(timeoutMs / 1000)}s`
      : (res.error ?? (res.stderr.trim().slice(0, 300) || `git exited ${res.exitCode ?? "?"}`));
    throw new RepositoryUnavailableError(`Cloning "${entry.id}" failed: ${reason}`);
  }
  return { path: dir, name: entry.name, temporary: true, entry };
}

/** Always clean up a resolved repository's temp workspace (safe on non-temp). */
export function cleanupRepository(resolved: ResolvedRepository): void {
  if (!resolved.temporary) return;
  try {
    rmSync(resolved.path, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; the workspace lives under the OS tmp dir.
  }
}

export interface RepositoryStats {
  readonly files: number | null;
  readonly symbols: number | null;
  /** Language name → file count (from the index or a fresh scan). */
  readonly languages: Readonly<Record<string, number>> | null;
  readonly sizeBytes: number | null;
  readonly scanned: boolean;
  readonly lastIndexedAt: string | null;
}

/**
 * Real repository metadata — never invented. Prefers the existing context
 * index (cheap SQLite read through the Context SDK); falls back to a metadata
 * scan when no index exists. Fields that cannot be determined are `null`.
 */
export async function repositoryStats(repositoryPath: string): Promise<RepositoryStats> {
  const dbPath = join(repositoryPath, ".codeatlas", "context.db");
  if (existsSync(dbPath)) {
    try {
      const sdk = createContextSDK({ repositoryPath });
      try {
        const overview = sdk.project.overview("summary");
        return {
          files: overview.counts.files,
          symbols: overview.counts.symbols,
          languages: { ...overview.languages },
          sizeBytes: null,
          scanned: false,
          lastIndexedAt: overview.savedAt || null,
        };
      } finally {
        sdk.close();
      }
    } catch {
      // fall through to the scan
    }
  }
  const scan = await scanProjectOverview(repositoryPath as never);
  if (!scan.ok) {
    return {
      files: null,
      symbols: null,
      languages: null,
      sizeBytes: null,
      scanned: false,
      lastIndexedAt: null,
    };
  }
  const s = scan.value;
  const languages: Record<string, number> = {};
  for (const lang of s.languages) languages[lang.name] = lang.fileCount;
  return {
    files: s.totalFiles,
    symbols: null,
    languages,
    sizeBytes: s.files.reduce((sum, f) => sum + f.sizeBytes, 0),
    scanned: true,
    lastIndexedAt: null,
  };
}
