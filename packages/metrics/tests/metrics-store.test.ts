import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MetricsStore } from "../src/metrics-store";
import { METRICS_SCHEMA_VERSION, createEmptySnapshot } from "../src/types";

function tmpDir(): string {
  const dir = join(tmpdir(), `metrics-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("MetricsStore", () => {
  let cleanup: string[] = [];

  afterEach(() => {
    for (const dir of cleanup) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanup = [];
  });

  it("loads an empty snapshot when no file exists", () => {
    const dir = tmpDir();
    cleanup.push(dir);
    const store = new MetricsStore({ filePath: join(dir, ".codeatlas", "metrics.json") });
    const snap = store.load();
    expect(snap.version).toBe(METRICS_SCHEMA_VERSION);
    expect(snap.repository.name).toBe("unknown");
    expect(snap.activity.scans).toBe(0);
  });

  it("round-trips a snapshot through save/load", () => {
    const dir = tmpDir();
    cleanup.push(dir);
    const filePath = join(dir, ".codeatlas", "metrics.json");
    const store = new MetricsStore({ filePath });
    const snap = {
      ...createEmptySnapshot("my-project"),
      repository: { ...createEmptySnapshot("my-project").repository, files: 42 },
      activity: { ...createEmptySnapshot("my-project").activity, scans: 3 },
    };
    store.save(snap);

    const store2 = new MetricsStore({ filePath });
    const loaded = store2.load();
    expect(loaded.repository.name).toBe("my-project");
    expect(loaded.repository.files).toBe(42);
    expect(loaded.activity.scans).toBe(3);
  });

  it("uses atomic write (tmp + rename)", () => {
    const dir = tmpDir();
    cleanup.push(dir);
    const filePath = join(dir, ".codeatlas", "metrics.json");
    const store = new MetricsStore({ filePath });
    const snap = createEmptySnapshot("test");
    store.save(snap);

    // The final file should exist
    expect(existsSync(filePath)).toBe(true);
    // No .tmp file should remain
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it("handles corrupted JSON gracefully", () => {
    const dir = tmpDir();
    cleanup.push(dir);
    const filePath = join(dir, ".codeatlas", "metrics.json");
    mkdirSync(join(dir, ".codeatlas"), { recursive: true });
    writeFileSync(filePath, "not valid json {{{", "utf-8");

    const store = new MetricsStore({ filePath });
    const snap = store.load();
    // Should return empty snapshot, not crash
    expect(snap.version).toBe(METRICS_SCHEMA_VERSION);
    expect(snap.repository.name).toBe("unknown");
  });

  it("handles unsupported schema version gracefully", () => {
    const dir = tmpDir();
    cleanup.push(dir);
    const filePath = join(dir, ".codeatlas", "metrics.json");
    mkdirSync(join(dir, ".codeatlas"), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ version: 999 }), "utf-8");

    const store = new MetricsStore({ filePath });
    const snap = store.load();
    expect(snap.version).toBe(METRICS_SCHEMA_VERSION);
  });

  it("handles oversized file gracefully", () => {
    const dir = tmpDir();
    cleanup.push(dir);
    const filePath = join(dir, ".codeatlas", "metrics.json");
    mkdirSync(join(dir, ".codeatlas"), { recursive: true });
    // Write a file larger than 1 MiB
    writeFileSync(filePath, "x".repeat(2_000_000), "utf-8");

    const store = new MetricsStore({ filePath });
    const snap = store.load();
    expect(snap.version).toBe(METRICS_SCHEMA_VERSION);
  });

  it("caches in-memory snapshot", () => {
    const dir = tmpDir();
    cleanup.push(dir);
    const filePath = join(dir, ".codeatlas", "metrics.json");
    const store = new MetricsStore({ filePath });
    const snap1 = store.load();
    const snap2 = store.load();
    expect(snap1).toBe(snap2); // Same object reference
  });

  it("remove() deletes the file", () => {
    const dir = tmpDir();
    cleanup.push(dir);
    const filePath = join(dir, ".codeatlas", "metrics.json");
    const store = new MetricsStore({ filePath });
    store.save(createEmptySnapshot("test"));
    expect(existsSync(filePath)).toBe(true);
    store.remove();
    expect(existsSync(filePath)).toBe(false);
  });
});
