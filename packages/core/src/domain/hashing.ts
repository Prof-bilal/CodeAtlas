/**
 * A persisted set of file hashes used to detect changes between runs.
 * Each entry maps a file path to its SHA-256 hex digest.
 */
export interface HashSnapshot {
  readonly hashes: Readonly<Record<string, string>>;
}

/** Options for building a {@link HashSnapshot}. */
export interface BuildSnapshotOptions {
  /**
   * When `true`, an unreadable file fails the whole snapshot build.
   * When `false` (default), unreadable files are skipped.
   */
  readonly strict?: boolean;
  /**
   * Maximum number of files hashed concurrently. Defaults to a CPU-derived
   * bound; I/O-bound trees benefit from parallelism, tiny trees from a lower
   * value.
   */
  readonly concurrency?: number;
}

/** The result of comparing two {@link HashSnapshot}s. */
export interface HashDiff {
  /** Present in both, but with different content — needs re-processing. */
  readonly changed: readonly string[];
  /** Present only in the newer (current) snapshot. */
  readonly added: readonly string[];
  /** Present only in the older (previous) snapshot — no longer on disk. */
  readonly deleted: readonly string[];
  /** Identical content in both snapshots. */
  readonly unchanged: readonly string[];
  readonly changedCount: number;
  readonly addedCount: number;
  readonly deletedCount: number;
  readonly unchangedCount: number;
}
