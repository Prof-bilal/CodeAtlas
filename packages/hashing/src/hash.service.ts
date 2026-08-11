import type { BuildSnapshotOptions, HashDiff, HashPort, HashSnapshot } from "@atlas/core";
import type { Result } from "@atlas/shared";
// Re-export the core `HashDiff` type so the package index can surface it
// (see `src/index.ts`). It is a core domain type, not defined here.
export type { HashDiff };
import { hashContent } from "./crypto";
import { compareHashes, getChangedFiles } from "./diff";
import { buildSnapshot, computeFileHash, loadSnapshot, saveSnapshot } from "./snapshot";

/**
 * Default implementation of {@link HashPort}: SHA-256 hashing with JSON
 * snapshot persistence and change detection.
 */
export class HashService implements HashPort {
  public hashContent(content: string): string {
    return hashContent(content);
  }

  public async getHash(path: string): Promise<Result<string>> {
    return computeFileHash(path);
  }

  public async buildSnapshot(
    paths: readonly string[],
    options: BuildSnapshotOptions = {},
  ): Promise<Result<HashSnapshot>> {
    return buildSnapshot(paths, options);
  }

  public compareHashes(previous: HashSnapshot, current: HashSnapshot): HashDiff {
    return compareHashes(previous, current);
  }

  public getChangedFiles(previous: HashSnapshot, current: HashSnapshot): readonly string[] {
    return getChangedFiles(previous, current);
  }

  public async saveSnapshot(snapshot: HashSnapshot, filePath: string): Promise<Result<void>> {
    return saveSnapshot(snapshot, filePath);
  }

  public async loadSnapshot(filePath: string): Promise<Result<HashSnapshot>> {
    return loadSnapshot(filePath);
  }
}
