#!/usr/bin/env node
// Scale-grid probe (Phase 0 Task 5, measure-only).
// Synthesizes flat TS repos, indexes them with the SDK-owned indexer, and
// publishes index/probe timings. No network, no provider. Temp dirs cleaned.
import { mkdtempSync, writeFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const sizes = (process.env.SCALE_GRID_SIZES ?? "100,1000")
  .split(",")
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);

function makeRepo(n) {
  const root = mkdtempSync(join(tmpdir(), `atlas-scale-${n}-`));
  for (let i = 0; i < n; i += 1) {
    const mod = `m${i}`;
    writeFileSync(
      join(root, `${mod}.ts`),
      `export function ${mod}Fn(x: number): number { return x + ${i}; }\n` +
        `import { m${(i + 1) % n}Fn } from "./m${(i + 1) % n}";\n` +
        `export const ${mod}Val = typeof m${(i + 1) % n}Fn;\n`,
    );
  }
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: `scale-${n}` }));
  return root;
}

console.log("| Corpus | Index time (ms) | DB bytes | Note |");
console.log("|---|---|---|---|");
for (const n of sizes) {
  const root = makeRepo(n);
  try {
    const started = performance.now();
    // Index via the SDK-owned indexer through tsx so the grid works from a
    // source checkout without a prior build. Falls back to a scan-only row
    // when the SDK cannot load (still publishes the corpus size honestly).
    let dbBytes = -1;
    let ms = -1;
    try {
      const { indexProject } = await import("../../packages/sdk/src/index.ts");
      const res = await indexProject({ repositoryPath: root, mode: "build" });
      ms = Math.round(performance.now() - started);
      if (!res.ok) {
        console.log(`| ${n} files | ${ms} | n/a | indexProject failed: ${res.error.message} |`);
        continue;
      }
      try {
        dbBytes = statSync(join(root, ".codeatlas", "context.db")).size;
      } catch {
        dbBytes = -1;
      }
      console.log(`| ${n} files | ${ms} | ${dbBytes} | ok (RSS ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MiB heap) |`);
    } catch (e) {
      ms = Math.round(performance.now() - started);
      console.log(`| ${n} files | n/a | n/a | SDK import skipped (${String(e).slice(0, 120)}) |`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
console.log("");
console.log("Paste into benchmarks/retrieval-tasks/BASELINE.md. Probe p50/p95 per");
console.log("primitive comes from MCP timings in a live run (see freshness-matrix).");
