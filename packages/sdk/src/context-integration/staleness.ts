import { resolve } from "node:path";
import { buildSnapshot, compareHashes } from "@atlas/hashing";
import type { ContextSDK } from "../context/index";
import type { StaleContextSignal } from "./models";

/**
 * Detect whether the index is stale relative to the working tree.
 *
 * The persisted per-file hashes (`ContextSDK.hashes()`) are compared against the
 * current hashes of the same files on disk (via `@atlas/hashing` change
 * detection). The signal is honest and best-effort:
 * - `"unavailable"` — no index exists,
 * - `"unknown"` — the persisted hashes are empty, or the on-disk files cannot
 *   be read (e.g. indexed paths are synthetic / do not resolve on disk), so no
 *   comparison is possible,
 * - `"fresh"` / `"stale"` — every persisted file resolved and matched /
 *   differed from the working tree.
 */
export async function detectStaleness(context: ContextSDK): Promise<StaleContextSignal> {
  const status = context.status();
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

  const persisted = context.hashes();
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
  const repositoryPath = context.config.repositoryPath;
  const persistedAbsolute: Record<string, string> = {};
  for (const [path, hash] of Object.entries(persisted)) {
    persistedAbsolute[resolve(repositoryPath, path)] = hash;
  }

  const current = await buildSnapshot(Object.keys(persistedAbsolute));
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
