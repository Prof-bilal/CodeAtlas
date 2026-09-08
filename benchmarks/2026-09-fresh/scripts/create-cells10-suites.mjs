#!/usr/bin/env node
/**
 * create-cells10-suites.mjs — Create the 2 lean 10-cell benchmark suites.
 *
 * Suites cells10-A (baseline) and cells10-B (codeatlas), runsPerTask=1,
 * referencing the curated 5-task manifest (tasks/cells10.json).
 *
 * Usage: node scripts/create-cells10-suites.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/abdullah/Projects/CodeAtlas";
const SUITES_DIR = join(ROOT, ".codeatlas/benchmarks/suites");
const TASK_FILE = "cells10-tasks.json";
const MODEL = "opencode/mimo-v2.5-free";

const SUITES = [
  { id: "cells10-A", modes: ["baseline"], label: "A — Baseline" },
  { id: "cells10-B", modes: ["codeatlas"], label: "B — CodeAtlas" },
];

for (const s of SUITES) {
  const dir = join(SUITES_DIR, s.id);
  if (existsSync(dir)) {
    console.log(`SKIP ${s.id} (already exists)`);
    continue;
  }
  mkdirSync(dir, { recursive: true });
  const suite = {
    id: s.id,
    name: `10-cell accuracy — ${s.label}`,
    config: {
      id: s.id,
      name: `10-cell accuracy — ${s.label}`,
      agent: "opencode",
      model: MODEL,
      modes: s.modes,
      taskTimeoutMs: 840000,
      runsPerTask: 1,
    },
    createdAt: new Date().toISOString(),
    status: "created",
    taskFiles: [TASK_FILE],
  };
  writeFileSync(join(dir, "suite.json"), JSON.stringify(suite, null, 2));
  console.log(`CREATED ${s.id} (runsPerTask=1, modes=${s.modes}, taskFile=${TASK_FILE})`);
}
console.log("Done.");