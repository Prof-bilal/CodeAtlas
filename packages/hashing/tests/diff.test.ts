import type { HashSnapshot } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { compareHashes, getChangedFiles } from "../src/diff";

function snapshot(map: Record<string, string>): HashSnapshot {
  return { hashes: map };
}

describe("compareHashes", () => {
  const previous = snapshot({
    "a.ts": "hash-a",
    "b.ts": "hash-b-old",
    "c.ts": "hash-c",
  });
  const current = snapshot({
    "a.ts": "hash-a",
    "b.ts": "hash-b-new",
    "d.ts": "hash-d",
  });

  it("classifies changed, added, deleted, and unchanged files", () => {
    const diff = compareHashes(previous, current);
    expect(diff.changed).toEqual(["b.ts"]);
    expect(diff.added).toEqual(["d.ts"]);
    expect(diff.deleted).toEqual(["c.ts"]);
    expect(diff.unchanged).toEqual(["a.ts"]);
  });

  it("reports accurate counts", () => {
    const diff = compareHashes(previous, current);
    expect(diff.changedCount).toBe(1);
    expect(diff.addedCount).toBe(1);
    expect(diff.deletedCount).toBe(1);
    expect(diff.unchangedCount).toBe(1);
  });

  it("treats identical snapshots as all unchanged", () => {
    const diff = compareHashes(previous, snapshot({ ...previous.hashes }));
    expect(diff.changed).toHaveLength(0);
    expect(diff.added).toHaveLength(0);
    expect(diff.deleted).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(3);
  });
});

describe("getChangedFiles", () => {
  it("returns changed and added files but not deleted", () => {
    const diff = compareHashes(
      snapshot({ "a.ts": "old", "gone.ts": "x" }),
      snapshot({ "a.ts": "new", "added.ts": "y" }),
    );
    const changed = getChangedFiles(
      snapshot({ "a.ts": "old", "gone.ts": "x" }),
      snapshot({ "a.ts": "new", "added.ts": "y" }),
    );
    expect(changed).toEqual(["a.ts", "added.ts"]);
    expect(changed).not.toContain("gone.ts");
    expect(diff.deleted).toEqual(["gone.ts"]);
  });

  it("returns an empty list when nothing changed", () => {
    const snap = snapshot({ "a.ts": "hash" });
    expect(getChangedFiles(snap, snap)).toEqual([]);
  });
});
