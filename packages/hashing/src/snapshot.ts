import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BuildSnapshotOptions, HashSnapshot } from "@atlas/core";
import { DEFAULT_CONCURRENCY, type Result, fail, mapWithConcurrency, ok } from "@atlas/shared";
import { hashContent } from "./crypto";

/** Schema version of the on-disk hash snapshot. Bump on shape changes. */
export const SNAPSHOT_VERSION = 1;

/** On-disk representation of a hash snapshot (versioned for migration). */
interface SnapshotFile {
  readonly version: number;
  readonly hashes: Readonly<Record<string, string>>;
}

/**
 * Compute the SHA-256 hex digest of a file on disk.
 *
 * @param path - Absolute path of the file to hash.
 * @returns A {@link Result} wrapping the hex digest, or a failure when the
 *   file cannot be read.
 */
export async function computeFileHash(path: string): Promise<Result<string>> {
  try {
    const content = await readFile(path, "utf8");
    return ok(hashContent(content));
  } catch (error) {
    return fail(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Build a {@link HashSnapshot} from a list of file paths.
 *
 * @param paths - Absolute paths of files to hash.
 * @param options - {@link BuildSnapshotOptions}; when `strict` is `true` an
 *   unreadable file fails the whole build, otherwise it is skipped.
 * @returns A {@link Result} wrapping the snapshot, or a failure in strict mode.
 */
export async function buildSnapshot(
  paths: readonly string[],
  options: BuildSnapshotOptions = {},
): Promise<Result<HashSnapshot>> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const hashes: Record<string, string> = {};
  try {
    const results = await mapWithConcurrency(paths, concurrency, async (path) => {
      const result = await computeFileHash(path);
      return { path, result };
    });
    for (const { path, result } of results) {
      if (result.ok) {
        hashes[path] = result.value;
      } else if (options.strict === true) {
        return fail(result.error);
      }
    }
    return ok({ hashes });
  } catch (error) {
    return fail(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Persist a {@link HashSnapshot} to a JSON file (creating parent directories).
 *
 * @param snapshot - The snapshot to store.
 * @param filePath - Absolute path of the JSON file to write.
 * @returns A {@link Result} that fails only if writing fails.
 */
export async function saveSnapshot(
  snapshot: HashSnapshot,
  filePath: string,
): Promise<Result<void>> {
  try {
    await mkdir(dirname(filePath), { recursive: true });
    const data: SnapshotFile = {
      version: SNAPSHOT_VERSION,
      hashes: { ...snapshot.hashes },
    };
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    return ok(undefined);
  } catch (error) {
    return fail(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Load a {@link HashSnapshot} from a JSON file written by
 * {@link saveSnapshot}.
 *
 * @param filePath - Absolute path of the JSON snapshot file.
 * @returns A {@link Result} wrapping the snapshot, or an empty snapshot when
 *   the file is absent or malformed.
 */
export async function loadSnapshot(filePath: string): Promise<Result<HashSnapshot>> {
  if (!existsSync(filePath)) {
    return ok({ hashes: {} });
  }
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "hashes" in parsed &&
      typeof (parsed as SnapshotFile).hashes === "object"
    ) {
      return ok({ hashes: (parsed as SnapshotFile).hashes });
    }
    return ok({ hashes: {} });
  } catch {
    return ok({ hashes: {} });
  }
}
