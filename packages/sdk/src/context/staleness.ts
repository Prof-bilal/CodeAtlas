import { resolve } from "node:path";
import type { ProjectScan } from "@atlas/core";
import { buildSnapshot, compareHashes } from "@atlas/hashing";
import type { Result } from "@atlas/shared";
import type { FreshnessSignal } from "./models";

/**
 * The minimal read surface a freshness check needs from a context reader.
 * Kept structural so the same implementation serves the Context SDK façade and
 * the context → agent integration layer without a runtime dependency cycle.
 */
export interface FreshnessInput {
  /** Resolved repository/database paths. */
  readonly config: { readonly repositoryPath: string };
  /** The SDK status (availability + last update). */
  readonly status: () => { readonly available: boolean; readonly lastUpdated: string };
  /** The persisted per-file hashes (path → SHA-256). */
  readonly hashes: () => Readonly<Record<string, string>>;
  /**
   * Discover the current working-tree files. When provided, files added after
   * the last index are hashed and reported as `added` (without it, additions
   * cannot be detected because the "current" snapshot would only contain
   * already-persisted paths). Falls back to persisted-only comparison when the
   * scan fails.
   */
  readonly scan?: () => Promise<Result<ProjectScan>>;
}

/**
 * Detect whether the index is fresh relative to the working tree.
 *
 * The persisted per-file hashes are compared against the current hashes of the
 * same files on disk (via `@atlas/hashing` change detection). The signal is
 * honest and best-effort:
 * - `"unavailable"` — no index exists,
 * - `"unknown"` — the persisted hashes are empty, or the on-disk files cannot
 *   be read (e.g. indexed paths are synthetic / do not resolve on disk), so no
 *   comparison is possible,
 * - `"fresh"` / `"stale"` — every persisted file resolved and matched /
 *   differed from the working tree.
 */
export async function detectFreshness(input: FreshnessInput): Promise<FreshnessSignal> {
  const status = input.status();
  if (!status.available) {
    return {
      state: "unavailable",
      available: false,
      lastUpdated: "",
      changed: [],
      added: [],
      deleted: [],
    };
  }

  const persisted = input.hashes();
  const paths = Object.keys(persisted);
  if (paths.length === 0) {
    return {
      state: "unknown",
      available: true,
      lastUpdated: status.lastUpdated,
      changed: [],
      added: [],
      deleted: [],
    };
  }

  // Resolve both sides to the same absolute keys so `compareHashes` can match.
  const persistedAbsolute: Record<string, string> = {};
  for (const [path, hash] of Object.entries(persisted)) {
    persistedAbsolute[resolve(input.config.repositoryPath, path)] = hash;
  }

  // Build the "current" snapshot from the whole working tree (when a scanner
  // is available) so newly added files are hashed and reported as `added`.
  // Without a scan, only persisted paths are compared and additions cannot be
  // detected; a failed scan falls back to that narrower comparison.
  let currentPaths = Object.keys(persistedAbsolute);
  if (input.scan !== undefined) {
    const scan = await input.scan();
    if (scan.ok) {
      currentPaths = scan.value.files.map((file) => file.path);
    }
  }

  const current = await buildSnapshot(currentPaths);
  if (!current.ok || Object.keys(current.value.hashes).length === 0) {
    // None of the persisted files resolved on disk — nothing to compare.
    return {
      state: "unknown",
      available: true,
      lastUpdated: status.lastUpdated,
      changed: [],
      added: [],
      deleted: [],
    };
  }

  const diff = compareHashes({ hashes: persistedAbsolute }, current.value);
  const stale = diff.changedCount > 0 || diff.addedCount > 0 || diff.deletedCount > 0;
  return {
    state: stale ? "stale" : "fresh",
    available: true,
    lastUpdated: status.lastUpdated,
    changed: diff.changed,
    added: diff.added,
    deleted: diff.deleted,
  };
}
