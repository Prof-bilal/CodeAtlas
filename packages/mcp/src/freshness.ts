import { stat } from "node:fs/promises";
import { type ContextSDK, type FilePath, scanProjectOverview } from "@atlas/sdk";

/**
 * The outcome of an auto-refresh check, surfaced to clients so they never have
 * to guess whether the results they received were served from a fresh index.
 *
 * - `fresh` — the index matches the working tree (optionally after a refresh).
 * - `stale` — a change was detected but the refresh failed; results may be stale.
 * - `unavailable` — no index exists (or auto-refresh is disabled).
 * - `unknown` — staleness could not be determined (e.g. the tree could not be
 *   scanned); results are served as-is and must not be assumed fresh.
 */
export interface FreshnessReport {
  readonly state: "fresh" | "stale" | "unavailable" | "unknown";
  readonly refreshed: boolean;
  readonly checkedAt: string;
  /** Number of changed/added/deleted files detected before a refresh (when known). */
  readonly changedFiles?: number;
  /** Human-readable detail for the `stale`/`unknown` states. */
  readonly message?: string;
}

export interface FreshnessControllerOptions {
  /** Master switch; `false` disables both probing and refreshing. */
  readonly autoRefresh: boolean;
  /**
   * Debounce for the full path-set probe. `0` (default) probes on every read
   * call so external edits are picked up immediately; a positive value skips
   * the probe within the window and serves the previous outcome instead.
   */
  readonly intervalMs: number;
  /** Project root, scanned through the SDK scanner to detect added files. */
  readonly root: string;
}

/**
 * Debounced, mtime-based staleness guard that keeps the MCP read surface in
 * sync with the working tree. It probes cheaply (metadata only — no content
 * hashing, no parsing), and only when a change is detected does it run the
 * SDK-owned incremental `refresh()` (which re-parses just the changed files).
 * A repository with no changes is never re-indexed.
 */
export class FreshnessController {
  /** Cached `savedAt` baseline; reset to `now` after each successful refresh. */
  private baselineMs = 0;
  /** When the full path-set probe last ran (drives the debounce window). */
  private lastFullCheckAt = 0;

  public constructor(private readonly options: FreshnessControllerOptions) {}

  /** Forget the cached baseline/probe state (e.g. after the SDK is re-opened). */
  public reset(): void {
    this.baselineMs = 0;
    this.lastFullCheckAt = 0;
  }

  /** Ensure the index is fresh, refreshing it when the working tree changed. */
  public async ensureFresh(sdk: ContextSDK): Promise<FreshnessReport> {
    const checkedAt = new Date().toISOString();
    if (!this.options.autoRefresh || !sdk.isAvailable) {
      return { state: "unavailable", refreshed: false, checkedAt };
    }
    if (this.baselineMs === 0) {
      const parsed = Date.parse(sdk.status().lastUpdated);
      this.baselineMs = Number.isNaN(parsed) ? Date.now() : parsed;
    }

    const withinInterval = Date.now() - this.lastFullCheckAt < this.options.intervalMs;
    if (!withinInterval) {
      this.lastFullCheckAt = Date.now();
      const changes = await probeChanges(sdk, this.options.root, this.baselineMs);
      if (changes === null) {
        return {
          state: "unknown",
          refreshed: false,
          checkedAt,
          message: "Could not determine working-tree changes; results served as-is.",
        };
      }
      if (changes > 0) {
        const result = await sdk.refresh();
        if (result.ok) {
          // Re-base on the index's own savedAt so edits that land *during* the
          // refresh (mtime newer than the persisted snapshot) are still caught
          // by the next probe.
          const parsed = Date.parse(sdk.status().lastUpdated);
          this.baselineMs = Number.isNaN(parsed) ? Date.now() : parsed;
          return {
            state: "fresh",
            refreshed: true,
            checkedAt,
            changedFiles: changes,
          };
        }
        return {
          state: "stale",
          refreshed: false,
          checkedAt,
          changedFiles: changes,
          message: `Auto-refresh failed: ${result.error.message}`,
        };
      }
      return { state: "fresh", refreshed: false, checkedAt };
    }

    // Within the debounce window: serve the previous verdict without probing.
    return { state: "fresh", refreshed: false, checkedAt };
  }
}

/**
 * Cheap working-tree probe: diff the indexed file set against the current
 * on-disk set and compare mtimes against the index `savedAt` baseline.
 *
 * Returns the number of changed/added/deleted files, or `null` when the tree
 * cannot be scanned (unknown state).
 */
async function probeChanges(
  sdk: ContextSDK,
  root: string,
  baselineMs: number,
): Promise<number | null> {
  const indexed = new Set(Object.keys(sdk.hashes()));
  const scan = await scanProjectOverview(root as FilePath);
  if (!scan.ok) {
    return null;
  }
  const current = new Set(scan.value.files.map((file) => file.path as string));

  let changes = 0;
  for (const path of indexed) {
    if (!current.has(path)) {
      changes += 1; // deleted
      continue;
    }
    try {
      const st = await stat(path as FilePath);
      if (st.mtimeMs > baselineMs) {
        changes += 1; // modified
      }
    } catch {
      changes += 1; // unreadable counts as changed; refresh will confirm
    }
  }
  for (const path of current) {
    if (!indexed.has(path)) {
      changes += 1; // added
    }
  }
  return changes;
}
