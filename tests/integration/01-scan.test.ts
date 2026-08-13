import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { type IndexResult, createContextSDK, indexProject } from "@atlas/sdk";
import { ContextStore } from "@atlas/storage";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CODEATLAS_DIR,
  CONTEXT_DB,
  REPO_PATH,
  removeCodeAtlas,
  runCli,
  writeResult,
} from "./helpers";

interface ScanMetrics {
  readonly command: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly result: IndexResult | null;
  readonly dbSizeBytes: number;
  readonly manifest: Record<string, unknown> | null;
  readonly status: Record<string, unknown>;
}

describe("01 — initial CodeAtlas scan of AI Builder", () => {
  let metrics: ScanMetrics;
  let dbStats: {
    files: number;
    symbols: number;
    dependencies: number;
    modules: number;
    summaries: number;
    hashes: number;
  };
  let searchCount: number;

  beforeAll(async () => {
    await removeCodeAtlas();
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const cli = await runCli(["build", "--repo", REPO_PATH, "--json"]);
    const endedAt = new Date().toISOString();
    const durationMs = performance.now() - started;

    expect(cli.code, `scan failed: ${cli.stderr}`).toBe(0);
    const cliResult = JSON.parse(cli.stdout) as IndexResult;

    // Re-run the scan through the SDK source to double-check parity. This
    // second run sees the fresh index and should report everything unchanged.
    const sdkResult = await indexProject({ repositoryPath: REPO_PATH, mode: "build" });
    expect(sdkResult.ok, "SDK indexProject failed").toBe(true);
    const sdk = sdkResult.ok ? sdkResult.value : null;

    const context = createContextSDK({ repositoryPath: REPO_PATH });
    const status = context.status();
    searchCount = context.search.search("authentication", { limit: 5 }).length;
    context.close();

    const dbSizeBytes = existsSync(CONTEXT_DB) ? statBytes(CONTEXT_DB) : 0;
    const store = new ContextStore({ filePath: CONTEXT_DB });
    const snapshot = store.loadContext();
    store.close();
    dbStats = {
      files: snapshot.files?.length ?? 0,
      symbols: snapshot.symbols?.length ?? 0,
      dependencies: snapshot.dependencies?.length ?? 0,
      modules: snapshot.modules?.length ?? 0,
      summaries: snapshot.summaries?.length ?? 0,
      hashes: Object.keys(snapshot.hashes ?? {}).length,
    };

    const manifestPath = join(CODEATLAS_DIR, "manifest.json");
    const manifest = existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>)
      : null;

    metrics = {
      command: "atlas build --repo test-repo/AIbuilder --json",
      startedAt,
      endedAt,
      durationMs,
      result: cliResult,
      dbSizeBytes,
      manifest,
      status,
    };
    // Parity: the SDK's re-scan must agree on content counts while reporting
    // that nothing changed since the CLI's first scan.
    expect(sdk?.parsedFiles).toBe(cliResult.parsedFiles);
    expect(sdk?.unchanged).toBeGreaterThan(0);
    await writeResult("01-initial-scan", metrics);
  });

  it("builds the context index with the expected outcome", () => {
    const result = metrics.result;
    expect(result).not.toBeNull();
    expect(result?.mode).toBe("build");
    expect(result?.repositoryPath).toBe(REPO_PATH);
    expect(result?.parsedFiles).toBeGreaterThan(100);
    expect(result?.skippedFiles).toBe(0);
    expect(result?.symbols).toBeGreaterThan(1000);
    expect(result?.dependencies).toBeGreaterThan(1000);
    expect(result?.unchanged).toBe(0);
  });

  it("creates the manifest with repository metadata", () => {
    const manifest = metrics.manifest;
    expect(manifest).not.toBeNull();
    expect(manifest?.["name"]).toBe("AIbuilder");
    expect(manifest?.["framework"]).toBe("react");
    expect(manifest?.["packageManager"]).toBe("npm");
    const git = manifest?.["git"] as { isRepository?: boolean } | undefined;
    expect(git?.isRepository).toBe(true);
    expect(manifest?.["totalFiles"]).toBeGreaterThan(150);
  });

  it("populates all context-database tables", () => {
    expect(dbStats.files).toBeGreaterThan(100);
    expect(dbStats.symbols).toBeGreaterThan(1000);
    expect(dbStats.dependencies).toBeGreaterThan(1000);
    expect(dbStats.modules).toBeGreaterThan(20);
    expect(dbStats.summaries).toBe(0); // AI summaries are opt-in; none configured.
    expect(dbStats.hashes).toBeGreaterThan(100);
  });

  it("has a usable search index and SDK status", () => {
    expect(searchCount).toBeGreaterThan(0);
    const status = metrics.status as { available?: boolean; filesIndexed?: number };
    expect(status.available).toBe(true);
    expect(status.filesIndexed).toBeGreaterThan(100);
  });

  it("records a sane initial-scan duration and storage size", () => {
    expect(metrics.durationMs).toBeGreaterThan(0);
    expect(metrics.durationMs).toBeLessThan(300_000);
    expect(metrics.dbSizeBytes).toBeGreaterThan(1_000_000);
  });
});

function statBytes(path: string): number {
  return statSync(path).size;
}
