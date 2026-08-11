import type { HashDiff, HashSnapshot } from "@atlas/core";

/**
 * Compare two {@link HashSnapshot}s and classify every known path as changed,
 * added, deleted, or unchanged.
 *
 * @param previous - The older snapshot (e.g. persisted on disk).
 * @param current - The newer snapshot (e.g. freshly computed).
 * @returns A {@link HashDiff} with the four categories and their counts.
 */
export function compareHashes(previous: HashSnapshot, current: HashSnapshot): HashDiff {
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];

  const allKeys = new Set([...Object.keys(previous.hashes), ...Object.keys(current.hashes)]);

  for (const key of allKeys) {
    const previousHash = previous.hashes[key];
    const currentHash = current.hashes[key];

    if (previousHash === undefined) {
      added.push(key);
    } else if (currentHash === undefined) {
      deleted.push(key);
    } else if (previousHash === currentHash) {
      unchanged.push(key);
    } else {
      changed.push(key);
    }
  }

  return {
    changed,
    added,
    deleted,
    unchanged,
    changedCount: changed.length,
    addedCount: added.length,
    deletedCount: deleted.length,
    unchangedCount: unchanged.length,
  };
}

/**
 * Return the paths that need re-processing between two snapshots — files that
 * changed content or were newly added. Deleted files are intentionally
 * excluded (they cannot be re-processed).
 *
 * @param previous - The older snapshot.
 * @param current - The newer snapshot.
 * @returns The list of changed + added paths.
 */
export function getChangedFiles(previous: HashSnapshot, current: HashSnapshot): readonly string[] {
  const diff = compareHashes(previous, current);
  return [...diff.changed, ...diff.added];
}
