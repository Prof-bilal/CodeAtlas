import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashContent } from "../src/crypto";
import { buildSnapshot, loadSnapshot, saveSnapshot, SNAPSHOT_VERSION } from "../src/snapshot";
import { createTempDir, writeFile } from "./helpers";

describe("buildSnapshot", () => {
  it("hashes every existing file", async () => {
    const temp = createTempDir();
    try {
      const a = writeFile(temp.dir, "a.ts", "const a = 1;");
      const b = writeFile(temp.dir, "b.ts", "const b = 2;");
      const result = await buildSnapshot([a, b]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.hashes[a]).toBe(hashContent("const a = 1;"));
      expect(result.value.hashes[b]).toBe(hashContent("const b = 2;"));
    } finally {
      temp.cleanup();
    }
  });

  it("skips unreadable files by default", async () => {
    const temp = createTempDir();
    try {
      const a = writeFile(temp.dir, "a.ts", "x");
      const missing = `${temp.dir}/nope.ts`;
      const result = await buildSnapshot([a, missing]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.value.hashes)).toEqual([a]);
    } finally {
      temp.cleanup();
    }
  });

  it("fails on unreadable files in strict mode", async () => {
    const temp = createTempDir();
    try {
      const a = writeFile(temp.dir, "a.ts", "x");
      const result = await buildSnapshot([a, `${temp.dir}/nope.ts`], {
        strict: true,
      });
      expect(result.ok).toBe(false);
    } finally {
      temp.cleanup();
    }
  });
});

describe("saveSnapshot / loadSnapshot", () => {
  it("round-trips a snapshot through a JSON file", async () => {
    const temp = createTempDir();
    try {
      const snapshotPath = `${temp.dir}/.codeatlas/hashes.json`;
      const original = { hashes: { "a.ts": "abc", "b.ts": "def" } };
      const saved = await saveSnapshot(original, snapshotPath);
      expect(saved.ok).toBe(true);

      const loaded = await loadSnapshot(snapshotPath);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(loaded.value).toEqual(original);
    } finally {
      temp.cleanup();
    }
  });

  it("writes a versioned, human-readable JSON file", async () => {
    const temp = createTempDir();
    try {
      const snapshotPath = `${temp.dir}/hashes.json`;
      await saveSnapshot({ hashes: { "a.ts": "aaa" } }, snapshotPath);
      expect(existsSync(snapshotPath)).toBe(true);
      const raw = await import("node:fs/promises").then((m) => m.readFile(snapshotPath, "utf8"));
      const parsed = JSON.parse(raw) as { version: number; hashes: object };
      expect(parsed.version).toBe(SNAPSHOT_VERSION);
      expect(parsed.hashes).toEqual({ "a.ts": "aaa" });
    } finally {
      temp.cleanup();
    }
  });

  it("returns an empty snapshot when the file is missing", async () => {
    const loaded = await loadSnapshot("C:/nope/hashes.json");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value).toEqual({ hashes: {} });
  });

  it("returns an empty snapshot for malformed JSON", async () => {
    const temp = createTempDir();
    try {
      const snapshotPath = writeFile(temp.dir, "bad.json", "{ not json");
      const loaded = await loadSnapshot(snapshotPath);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(loaded.value).toEqual({ hashes: {} });
    } finally {
      temp.cleanup();
    }
  });
});
