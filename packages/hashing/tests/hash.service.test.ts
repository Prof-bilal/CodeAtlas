import { rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashContent } from "../src/crypto";
import { HashService } from "../src/hash.service";
import { createTempDir, writeFile } from "./helpers";

describe("HashService", () => {
  it("getHash returns the SHA-256 of a file's content", async () => {
    const temp = createTempDir();
    try {
      const path = writeFile(temp.dir, "a.ts", "export const x = 1;");
      const result = await new HashService().getHash(path);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(hashContent("export const x = 1;"));
    } finally {
      temp.cleanup();
    }
  });

  it("fails for an unreadable file", async () => {
    const result = await new HashService().getHash("C:/nope/missing.ts");
    expect(result.ok).toBe(false);
  });

  it("detects changed, added, and deleted files end-to-end", async () => {
    const temp = createTempDir();
    try {
      const service = new HashService();

      // Build the first snapshot.
      const a = writeFile(temp.dir, "a.ts", "const a = 1;");
      const b = writeFile(temp.dir, "b.ts", "const b = 2;");
      const previousResult = await service.buildSnapshot([a, b]);
      expect(previousResult.ok).toBe(true);
      if (!previousResult.ok) return;
      const previous = previousResult.value;

      // Mutate the working tree:
      //   - a.ts changes content
      //   - b.ts is deleted
      //   - c.ts is created
      writeFile(temp.dir, "a.ts", "const a = 2;");
      rmSync(b, { force: true });
      const c = writeFile(temp.dir, "c.ts", "const c = 3;");

      const currentResult = await service.buildSnapshot([a, b, c]);
      expect(currentResult.ok).toBe(true);
      if (!currentResult.ok) return;
      const current = currentResult.value;
      // b.ts was skipped because it no longer exists.
      expect(Object.hasOwn(current.hashes, b)).toBe(false);

      const diff = service.compareHashes(previous, current);
      expect(diff.changed).toEqual([a]);
      expect(diff.added).toEqual([c]);
      expect(diff.deleted).toEqual([b]);
      expect(diff.changedCount).toBe(1);
      expect(diff.addedCount).toBe(1);
      expect(diff.deletedCount).toBe(1);

      // getChangedFiles lists what needs re-processing (changed + added).
      expect(service.getChangedFiles(previous, current)).toEqual([a, c]);
    } finally {
      temp.cleanup();
    }
  });

  it("persists and reloads a snapshot, then diffs against it", async () => {
    const temp = createTempDir();
    try {
      const service = new HashService();
      const a = writeFile(temp.dir, "a.ts", "v1");
      const snapshotPath = `${temp.dir}/hashes.json`;

      const first = await service.buildSnapshot([a]);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      await service.saveSnapshot(first.value, snapshotPath);

      const loaded = await service.loadSnapshot(snapshotPath);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const reloaded = loaded.value;

      // Nothing changed yet -> no changed files.
      const afterReload = await service.buildSnapshot([a]);
      expect(afterReload.ok).toBe(true);
      if (!afterReload.ok) return;
      expect(service.compareHashes(reloaded, afterReload.value).changedCount).toBe(0);

      // Modify and re-diff.
      writeFile(temp.dir, "a.ts", "v2");
      const modified = await service.buildSnapshot([a]);
      expect(modified.ok).toBe(true);
      if (!modified.ok) return;
      expect(service.getChangedFiles(reloaded, modified.value)).toEqual([a]);
    } finally {
      temp.cleanup();
    }
  });
});
