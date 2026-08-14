import type { ContextSDK } from "../context/sdk";
import { detectFreshness } from "../context/staleness";
import type { StaleContextSignal } from "./models";

/**
 * Detect whether the index is stale relative to the working tree.
 *
 * Delegates to the shared core (`detectFreshness`), which compares the
 * persisted per-file hashes (`ContextSDK.hashes()`) against the current hashes
 * of the same files on disk (via `@atlas/hashing` change detection). The signal
 * is honest and best-effort: `"unavailable"` when no index exists, `"unknown"`
 * when no comparison is possible, and `"fresh"` / `"stale"` otherwise.
 */
export async function detectStaleness(context: ContextSDK): Promise<StaleContextSignal> {
  return detectFreshness({
    config: context.config,
    status: () => context.status(),
    hashes: () => context.hashes(),
  });
}
