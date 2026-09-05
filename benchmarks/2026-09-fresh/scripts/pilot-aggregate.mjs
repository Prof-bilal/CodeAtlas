#!/usr/bin/env node
/**
 * pilot-aggregate.mjs — Aggregate pilot results into a summary table.
 *
 * Reads raw-results/<CONFIG>-<TASK>/result.json (one per cell), plus the
 * suite task configs to map task → domain/difficulty, and produces:
 *  - per-cell table (config, task, mode, domain, difficulty, status, score,
 *    duration, tokens, cost, toolCalls, timedOut)
 *  - per-config aggregates (success rate, avg score, avg duration, avg tokens)
 *  - per-domain aggregates
 *  - config-pair deltas (A vs B = context value; B vs C = tools; C vs D = skills)
 *
 * Usage: node pilot-aggregate.mjs [--out <path>]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = "/home/abdullah/Projects/CodeAtlas/benchmarks/2026-09-fresh";
const RAW = join(ROOT, "raw-results");
const SUITES_DIR = "/home/abdullah/Projects/CodeAtlas/.codeatlas/benchmarks/suites";

const TASK_META = {
  "FRONTEND-MEDIUM-01": { domain: "frontend", difficulty: "medium" },
  "FRONTEND-HARD-01": { domain: "frontend", difficulty: "hard" },
  "BACKEND-EASY-01": { domain: "backend", difficulty: "easy" },
  "BACKEND-MEDIUM-01": { domain: "backend", difficulty: "medium" },
  "DEBUGGING-HARD-01": { domain: "debugging", difficulty: "hard" },
  "DEBUGGING-EXPERT-01": { domain: "debugging", difficulty: "expert" },
  "FULLSTACK-MEDIUM-01": { domain: "fullstack", difficulty: "medium" },
  "FULLSTACK-EXPERT-01": { domain: "fullstack", difficulty: "expert" },
  "REFACTORING-MEDIUM-01": { domain: "refactoring", difficulty: "medium" },
  "REFACTORING-HARD-01": { domain: "refactoring", difficulty: "hard" },
  "TESTING-MEDIUM-01": { domain: "testing", difficulty: "medium" },
  "TESTING-HARD-01": { domain: "testing", difficulty: "hard" },
  "EXT-HARD-01": { domain: "external-knowledge", difficulty: "hard" },
  "EXT-EXPERT-01": { domain: "external-knowledge", difficulty: "expert" },
  "ARCH-EASY-01": { domain: "architecture", difficulty: "easy" },
  "ARCH-MEDIUM-01": { domain: "architecture", difficulty: "medium" },
};

function loadTaskDefs() {
  const defs = {};
  for (const cfg of ["A", "B", "C", "D"]) {
    const p = join(SUITES_DIR, `pilot2-${cfg}`, "config.json");
    if (!existsSync(p)) continue;
    try {
      const conf = JSON.parse(readFileSync(p, "utf8"));
      for (const t of conf.tasks ?? []) {
        defs[t.id] = {
          domain: t.domain ?? TASK_META[t.id]?.domain ?? "unknown",
          difficulty: t.difficulty ?? TASK_META[t.id]?.difficulty ?? "unknown",
        };
      }
    } catch {}
  }
  return defs;
}
function readCell(dir) {
  const p = join(dir, "result.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

function main() {
  const defs = loadTaskDefs();
  const cells = [];
  for (const dirName of readdirSync(RAW).sort()) {
    const dir = join(RAW, dirName);
    if (!statSync(dir).isDirectory()) continue;
    const m = dirName.match(/^([A-D])-(.+)$/);
    if (!m) continue;
    const r = readCell(dir);
    const meta = defs[m[2]] ?? TASK_META[m[2]] ?? {};
    cells.push({
      config: m[1], taskId: m[2],
      domain: meta.domain ?? "unknown", difficulty: meta.difficulty ?? "unknown",
      timedOut: r?.timedOut ?? null, durationMs: r?.durationMs ?? null,
      tokens: r?.tokens?.total ?? null, tokenSource: r?.tokens?.source ?? "",
      cost: r?.cost ?? null, toolCallCount: r?.toolCallCount ?? null,
      evalStatus: r?.evaluation?.status ?? "", evalScore: r?.evaluation?.score ?? null,
      fileRatio: r?.evaluation?.fileRatio ?? null, conceptRatio: r?.evaluation?.conceptRatio ?? null,
      error: r?.error ?? "",
    });
  }

  console.log("CFG TASK                DOMAIN    DIFF  STATUS          SCORE DUR(s) TOK     COST      TOOLS T/O");
  for (const c of cells) {
    const dur = c.durationMs != null ? (c.durationMs / 1000).toFixed(0) : "-";
    console.log([c.config.padEnd(3), c.taskId.padEnd(20), c.domain.padEnd(9), c.difficulty.padEnd(5),
      (c.evalStatus || "pending").padEnd(15), String(c.evalScore ?? "-").padEnd(5), dur.padEnd(7),
      String(c.tokens ?? "-").padEnd(7), c.cost != null ? c.cost.toFixed(4) : "-",
      String(c.toolCallCount ?? "-").padEnd(5), c.timedOut == null ? "-" : c.timedOut ? "Y" : "n"].join(" "));
  }

  console.log("\n== per-config aggregates ==");
  const configs = ["A", "B", "C", "D"];
  const avgScoreByCfg = {};
  for (const cfg of configs) {
    const cs = cells.filter((c) => c.config === cfg && c.evalScore != null);
    if (!cs.length) continue;
    const n = cs.length;
    const cnt = (s) => cs.filter((c) => c.evalStatus === s).length;
    avgScoreByCfg[cfg] = cs.reduce((s, c) => s + (c.evalScore ?? 0), 0) / n;
    const avgDur = cs.reduce((s, c) => s + (c.durationMs ?? 0), 0) / n / 1000;
    const avgTok = cs.reduce((s, c) => s + (c.tokens ?? 0), 0) / n;
    const avgCost = cs.reduce((s, c) => s + (c.cost ?? 0), 0) / n;
    const toRate = cs.filter((c) => c.timedOut).length / n;
    const avgTools = cs.reduce((s, c) => s + (c.toolCallCount ?? 0), 0) / n;
    console.log(`Config ${cfg}: n=${n} correct=${cnt("correct")} partial=${cnt("partially_correct")} incorrect=${cnt("incorrect")} failed=${cnt("failed")} ` +
      `avgScore=${avgScoreByCfg[cfg].toFixed(2)} avgDur=${avgDur.toFixed(0)}s avgTok=${avgTok.toFixed(0)} avgCost=$${avgCost.toFixed(4)} TO=${(toRate * 100).toFixed(0)}% tools=${avgTools.toFixed(1)}`);
  }

  console.log("\n== per-domain x difficulty (avgScore per config) ==");
  const combos = new Map();
  for (const c of cells) {
    if (c.evalScore == null) continue;
    const k = `${c.domain}/${c.difficulty}`;
    if (!combos.has(k)) combos.set(k, []);
    combos.get(k).push(c);
  }
  for (const [k, cs] of [...combos.entries()].sort()) {
    const byCfg = configs.map((cfg) => {
      const s = cs.filter((c) => c.config === cfg);
      return `${cfg}:${s.length ? (s.reduce((x, c) => x + c.evalScore, 0) / s.length).toFixed(2) : "-"}(${s.length})`;
    }).join("  ");
    console.log(`  ${k.padEnd(22)} ${byCfg}`);
  }

  console.log("\n== config-pair deltas (avg score diff) ==");
  const pairDelta = (a, b) => avgScoreByCfg[a] != null && avgScoreByCfg[b] != null ? (avgScoreByCfg[a] - avgScoreByCfg[b]).toFixed(2) : "-";
  console.log(`  A vs B (context):  ${pairDelta("A", "B")}`);
  console.log(`  B vs C (tools):    ${pairDelta("B", "C")}`);
  console.log(`  C vs D (skills):   ${pairDelta("C", "D")}`);

  const outPath = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : join(RAW, "summary.json");
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), cells, perConfig: avgScoreByCfg }, null, 2) + "\n");
  console.log(`\nwritten: ${outPath}`);
}

main();
