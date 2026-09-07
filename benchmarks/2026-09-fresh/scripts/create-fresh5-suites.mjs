#!/usr/bin/env node
/**
 * create-fresh5-suites.mjs — Create the 4 fresh 5x-runs benchmark suites.
 *
 * Suites fresh5-A/B/C/D with runsPerTask=5, referencing the existing
 * projected task files from the pilot.
 *
 * Usage: node scripts/create-fresh5-suites.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/abdullah/Projects/CodeAtlas";
const SUITES_DIR = join(ROOT, ".codeatlas/benchmarks/suites");

const SUITES = [
  {
    id: "fresh5-A",
    taskFile: "pilot2-A-tasks.json",
    modes: ["baseline"],
    modeLabel: "baseline",
  },
  {
    id: "fresh5-B",
    taskFile: "pilot2-B-tasks.json",
    modes: ["codeatlas"],
    modeLabel: "codeatlas",
  },
  {
    id: "fresh5-C",
    taskFile: "pilot2-C-tasks.json",
    modes: ["codeatlas"],
    modeLabel: "codeatlas",
  },
  {
    id: "fresh5-D",
    taskFile: "pilot2-D-tasks.json",
    modes: ["codeatlas"],
    modeLabel: "codeatlas",
  },
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
    name: `5x Full Matrix — ${s.id}`,
    config: {
      id: s.id,
      name: `5x Full Matrix — ${s.id}`,
      agent: "opencode",
      model: "opencode/mimo-v2.5-free",
      modes: s.modes,
      taskTimeoutMs: 1200000,
      runsPerTask: 5,
    },
    createdAt: new Date().toISOString(),
    status: "created",
    taskFiles: [s.taskFile],
  };
  writeFileSync(join(dir, "suite.json"), JSON.stringify(suite, null, 2));
  console.log(`CREATED ${s.id} (runsPerTask=5, modes=${s.modes}, taskFile=${s.taskFile})`);
}
console.log("Done.");
