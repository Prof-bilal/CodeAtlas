#!/usr/bin/env node
// Phase 0 retrieval-set smoke (plan §17 Phase 0 Task 3).
// Validates tasks.json schema and reports set composition. Full P@k/MRR/R@k
// scoring against a live index runs in Phase 6 via @atlas/benchmark's
// retrieval-metrics + paired-bootstrap (needs a built .codeatlas/context.db).
// This smoke stays green in CI with no index, no provider, no network.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tasksPath = resolve(process.argv[2] ?? "benchmarks/retrieval-tasks/tasks.json");
const raw = readFileSync(tasksPath, "utf8");
const tasks = JSON.parse(raw);

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

if (!Array.isArray(tasks)) fail("tasks.json must be an array");
if (tasks.length < 30) fail(`need >=30 tasks, found ${tasks.length}`);

const ids = new Set();
const cats = { locate: 0, repair: 0, trace: 0 };
for (const t of tasks) {
  for (const k of ["id", "category", "query", "fileTruth", "symbolTruth", "hopTruth"]) {
    if (t[k] === undefined) fail(`task ${t.id ?? "?"} missing ${k}`);
  }
  if (ids.has(t.id)) fail(`duplicate id ${t.id}`);
  ids.add(t.id);
  if (!(t.category in cats)) fail(`task ${t.id} bad category ${t.category}`);
  cats[t.category] += 1;
  if (!Array.isArray(t.fileTruth) || t.fileTruth.length === 0)
    fail(`task ${t.id} needs non-empty fileTruth`);
  if (!Array.isArray(t.symbolTruth)) fail(`task ${t.id} needs symbolTruth array`);
  if (typeof t.hopTruth !== "number" || t.hopTruth < 1 || t.hopTruth > 3)
    fail(`task ${t.id} hopTruth must be 1..3`);
}

console.log(`retrieval set OK: ${tasks.length} tasks`);
console.log(`  locate=${cats.locate} repair=${cats.repair} trace=${cats.trace}`);
console.log("  full P@k/MRR/R@k scoring: Phase 6 (needs built index + benchmark harness)");
