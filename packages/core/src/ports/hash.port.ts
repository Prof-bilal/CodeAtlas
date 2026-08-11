import type { Result } from "@atlas/shared";
import type { BuildSnapshotOptions, HashDiff, HashSnapshot } from "../domain/hashing";

/**
 * Computes and compares SHA-256 file hashes for change detection. This powers
 * incremental updates: a previous snapshot is compared with a freshly built
 * one to see which files changed, were added, or were deleted.
 */
export interface HashPort {
  /** Compute the SHA-256 hex digest of a string. Never fails. */
  hashContent(content: string): string;

  /** Compute the SHA-256 digest of a file on disk. */
  getHash(path: string): Promise<Result<string>>;

  /** Build a snapshot of hashes for a list of file paths. */
  buildSnapshot(
    paths: readonly string[],
    options?: BuildSnapshotOptions,
  ): Promise<Result<HashSnapshot>>;

  /** Compare two snapshots and classify every known path. */
  compareHashes(previous: HashSnapshot, current: HashSnapshot): HashDiff;

  /** Return the paths that changed or were added (need re-processing). */
  getChangedFiles(previous: HashSnapshot, current: HashSnapshot): readonly string[];

  /** Persist a snapshot to a JSON file on disk. */
  saveSnapshot(snapshot: HashSnapshot, filePath: string): Promise<Result<void>>;

  /** Load a snapshot from a JSON file; empty snapshot when absent/invalid. */
  loadSnapshot(filePath: string): Promise<Result<HashSnapshot>>;
}
