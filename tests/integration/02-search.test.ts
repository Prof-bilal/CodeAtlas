import { type SearchResult, createContextSDK } from "@atlas/sdk";
import { describe, expect, it } from "vitest";
import { REPO_PATH, runCli, writeResult } from "./helpers";

interface SearchRecord {
  readonly query: string;
  readonly mode: string;
  readonly latencyMs: number;
  readonly results: number;
  readonly topTitles: readonly string[];
  readonly duplicates: number;
  readonly failed: boolean;
  readonly error: string | null;
}

/**
 * 02 — Search battery against the real AI Builder index. Every query is a real
 * search through `createContextSDK` (and the CLI for the latency comparison).
 */
describe("02 — search over the AI Builder index", () => {
  const records: SearchRecord[] = [];

  const queries: readonly { readonly query: string; readonly expectMin: number }[] = [
    { query: "authentication", expectMin: 1 },
    { query: "RequireAuth", expectMin: 1 },
    { query: "login", expectMin: 1 },
    { query: "frontend components", expectMin: 1 },
    { query: "database", expectMin: 1 },
    { query: "vite.config", expectMin: 1 },
    { query: "routing", expectMin: 1 },
    { query: "deployment", expectMin: 0 },
    { query: "AI", expectMin: 1 },
    { query: "architecture", expectMin: 1 },
    { query: "nonexistent-term-xyz", expectMin: 0 },
    { query: "auth", expectMin: 1 },
    { query: "src/pages/auth/Login", expectMin: 1 },
  ];

  it("answers each real search query with ranked, duplicate-free results", async () => {
    const context = createContextSDK({ repositoryPath: REPO_PATH });
    try {
      // Warm up the in-memory search index so latency reflects query time.
      context.search.search("warmup", { limit: 1 });

      for (const { query, expectMin } of queries) {
        const started = performance.now();
        let hits: readonly SearchResult[] = [];
        let failed = false;
        let error: string | null = null;
        try {
          hits = context.search.search(query, { limit: 20 });
        } catch (err) {
          failed = true;
          error = err instanceof Error ? err.message : String(err);
        }
        const latencyMs = performance.now() - started;

        // Duplicate *entities* are the real bug signal; multiple distinct
        // symbols sharing a file or a name legitimately coexist.
        const entityKeys = hits.map((hit) => hit.targetId);
        const duplicates = entityKeys.length - new Set(entityKeys).size;

        records.push({
          query,
          mode: "sdk",
          latencyMs,
          results: hits.length,
          topTitles: hits.slice(0, 5).map((hit) => hit.title),
          duplicates,
          failed,
          error,
        });

        if (query === "nonexistent-term-xyz") {
          expect(hits.length).toBe(0);
          expect(failed).toBe(false);
        } else {
          expect(failed, `query "${query}" failed: ${error}`).toBe(false);
          expect(
            hits.length,
            `query "${query}" should have >= ${expectMin} results`,
          ).toBeGreaterThanOrEqual(expectMin);
        }
        expect(duplicates, `query "${query}" produced duplicate paths`).toBe(0);
      }
    } finally {
      context.close();
    }
    await writeResult("02-search-sdk", { records });
  });

  it("rejects an empty query with a typed error", () => {
    const context = createContextSDK({ repositoryPath: REPO_PATH });
    try {
      expect(() => context.search.search("")).toThrowError(/must not be empty/);
    } finally {
      context.close();
    }
    records.push({
      query: "",
      mode: "sdk",
      latencyMs: 0,
      results: 0,
      topTitles: [],
      duplicates: 0,
      failed: true,
      error: "InvalidQueryError: Search query must not be empty.",
    });
  });

  it("serves the same queries through the real CLI", async () => {
    const cliRecords: SearchRecord[] = [];
    for (const query of ["authentication", "RequireAuth", "vite.config", "nonexistent-term-xyz"]) {
      const cli = await runCli(["search", query, "--limit", "5"]);
      const started = performance.now();
      const result = await runCli(["search", query, "--limit", "5"]);
      const latencyMs = result.durationMs + (performance.now() - started) / 2;
      void cli;
      const lines = result.stdout.split("\n");
      const resultCount = /^(\d+) result/.exec(lines[0]);
      cliRecords.push({
        query,
        mode: "cli",
        latencyMs,
        results: resultCount === null ? 0 : Number.parseInt(resultCount[1], 10),
        topTitles: lines.slice(1, 6),
        duplicates: 0,
        failed: result.code !== 0,
        error: result.code !== 0 ? result.stderr : null,
      });
      if (query === "nonexistent-term-xyz") {
        expect(result.code).toBe(0);
        expect(result.stdout).toContain("No results");
      } else {
        expect(result.code, `cli search "${query}" failed: ${result.stderr}`).toBe(0);
        expect(result.stdout).toContain("result");
      }
    }
    await writeResult("02-search-cli", { records: cliRecords });
  });
});
