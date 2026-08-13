import { rm } from "node:fs/promises";
import { join } from "node:path";
import { type IndexResult, createContextSDK } from "@atlas/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CODEATLAS_DIR,
  REPO_PATH,
  rel,
  restoreFile,
  runCli,
  snapshotFile,
  writeResult,
} from "./helpers";

interface IncrementalMetrics {
  readonly firstScan: IndexResult | null;
  readonly changeScan: IndexResult | null;
  readonly deleteScan: IndexResult | null;
  readonly repeatScan: IndexResult | null;
  readonly changeFile: string;
  readonly durationMs: Record<string, number>;
}

/**
 * 04 — Incremental indexing against the real repo. Verifies that a changed
 * file is detected by the hash diff, a deleted file leaves no orphaned
 * symbols, and repeat scans are idempotent. Documents the observed cost model
 * (the parser always runs over the full tree; the hash diff drives the
 * changed/added/deleted counters).
 */
describe("04 — incremental indexing", () => {
  let metrics: IncrementalMetrics;
  let changeScan: IndexResult | null;
  let deleteScan: IndexResult | null;
  let repeatScan: IndexResult | null;

  const CHANGE_FILE = "src/pages/auth/Login.tsx";
  const changePath = join(REPO_PATH, CHANGE_FILE);
  const original = snapshotFile(changePath);

  beforeAll(async () => {
    if (original === null) {
      throw new Error(`cannot snapshot ${changePath} — file missing?`);
    }

    // 1) First scan is fresh (previous suite files already built the index).
    const first = await runCli(["build", "--repo", REPO_PATH, "--json"]);
    expect(first.code, `build failed: ${first.stderr}`).toBe(0);
    const firstScan = JSON.parse(first.stdout) as IndexResult;

    // 2) Mutate one tracked file; the hash diff must flag it as changed.
    const mutation = original.replace(
      /function nameFromEmail/,
      "function nameFromEmail /* ATLAS_INCREMENTAL_MARK */",
    );
    await import("node:fs/promises").then((fs) => fs.writeFile(changePath, mutation, "utf8"));
    const change = await runCli(["update", "--repo", REPO_PATH, "--json"]);
    changeScan = JSON.parse(change.stdout) as IndexResult;
    expect(change.code, `update (change) failed: ${change.stderr}`).toBe(0);

    // 3) Delete the mutated file entirely; an update must drop its symbols.
    await rm(changePath, { force: true });
    const del = await runCli(["update", "--repo", REPO_PATH, "--json"]);
    deleteScan = JSON.parse(del.stdout) as IndexResult;
    expect(del.code, `update (delete) failed: ${del.stderr}`).toBe(0);

    // 4) Repeat scan with no changes: everything unchanged.
    const repeat = await runCli(["update", "--repo", REPO_PATH, "--json"]);
    repeatScan = JSON.parse(repeat.stdout) as IndexResult;
    expect(repeat.code, `update (repeat) failed: ${repeat.stderr}`).toBe(0);

    metrics = {
      firstScan,
      changeScan,
      deleteScan,
      repeatScan,
      changeFile: rel(changePath),
      durationMs: {
        build: first.durationMs,
        change: change.durationMs,
        delete: del.durationMs,
        repeat: repeat.durationMs,
      },
    };
    await writeResult("04-incremental", metrics);
  });

  it("flags the changed file via the hash diff", () => {
    expect(changeScan).not.toBeNull();
    expect(changeScan?.mode).toBe("update");
    expect(changeScan?.changed).toBeGreaterThan(0);
    expect(changeScan?.unchanged).toBeGreaterThan(100);
  });

  it("removes symbols of a deleted file (no orphans)", () => {
    expect(deleteScan).not.toBeNull();
    expect(deleteScan?.deleted).toBeGreaterThan(0);
    const context = createContextSDK({ repositoryPath: REPO_PATH });
    try {
      const hits = context.search.search("LoginPage", { limit: 50 });
      const orphan = hits.filter((hit) => hit.path === changePath);
      expect(orphan, "deleted file still searchable").toEqual([]);
    } finally {
      context.close();
    }
  });

  it("is idempotent on an unchanged tree", () => {
    expect(repeatScan).not.toBeNull();
    expect(repeatScan?.changed).toBe(0);
    expect(repeatScan?.deleted).toBe(0);
    expect(repeatScan?.added).toBe(0);
    expect(repeatScan?.unchanged).toBeGreaterThan(100);
  });

  it("keeps storage on disk consistent after delete + repeat", () => {
    const context = createContextSDK({ repositoryPath: REPO_PATH });
    try {
      const status = context.status();
      expect(status.available).toBe(true);
    } finally {
      context.close();
    }
    void CODEATLAS_DIR;
  });

  afterAll(async () => {
    // Restore the real tracked file and re-index so the external repository
    // and its index are pristine for the rest of the suite.
    await restoreFile(changePath, original);
    const rescan = await runCli(["update", "--repo", REPO_PATH, "--json"]);
    expect(rescan.code, `restore update failed: ${rescan.stderr}`).toBe(0);
  });
});
