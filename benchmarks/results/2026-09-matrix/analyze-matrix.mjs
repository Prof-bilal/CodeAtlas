/**
 * Aggregate benchmark matrices (opencode / kilo / ollama suites) into a
 * model-by-model comparison table.
 *
 * Read-only over `.codeatlas/benchmarks/suites/<suite>/raw-results.json` —
 * safe to run while suites are still executing (shows partial progress).
 *
 * Usage (from repo root):
 *   node benchmarks/results/2026-09-matrix/analyze-matrix.mjs [suite-prefix]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const suitesDir = join(process.cwd(), ".codeatlas", "benchmarks", "suites");
const prefix = process.argv[2] ?? "";

if (!existsSync(suitesDir)) {
  console.error(`No suites directory at ${suitesDir}`);
  process.exit(1);
}

const REPO_FILES = {
  winston: "~116",
  commander: "~216",
  axios: "~466",
  rxjs: "~1,288",
};

const MODES = ["baseline", "codeatlas", "codeatlas-intel"];

const rows = [];

for (const suite of readdirSync(suitesDir).sort()) {
  if (prefix && !suite.startsWith(prefix)) continue;
  const rawPath = join(suitesDir, suite, "raw-results.json");
  if (!existsSync(rawPath)) continue;

  let raw;
  try {
    raw = JSON.parse(readFileSync(rawPath, "utf-8"));
  } catch {
    continue; // mid-write; skip
  }

  // suite id forms: oc-<model>-<repo>, kilo-<model>-<repo>, <repo>-ollama-7b
  let model = suite;
  let repo = suite;
  const oc = /^(oc|kilo)-([a-z0-9]+)-([a-z]+)$/.exec(suite);
  if (oc) {
    model = `${oc[1]}/${oc[2]}`;
    repo = oc[3];
  } else {
    const m = /^([a-z]+)-ollama/.exec(suite);
    if (m) {
      repo = m[1];
      model = "ollama-120b";
    }
  }

  const agg = Object.fromEntries(
    MODES.map((m) => [m, { n: 0, tok: 0, tools: 0, scores: [], timeouts: 0, errs: 0 }]),
  );

  for (const t of raw.tasks) {
    const a = agg[t.mode];
    if (!a) continue;
    a.n += 1;
    a.tok += t.tokens.total;
    a.tools += t.toolCallCount;
    if (t.timedOut) a.timeouts += 1;
    if (t.error) a.errs += 1;
  }
  for (const e of raw.evaluations) {
    const a = agg[e.mode];
    if (a && typeof e.evaluation?.score === "number") a.scores.push(e.evaluation.score);
  }

  const tasksSeen = new Set(raw.tasks.map((t) => t.taskId)).size;
  rows.push({ model, repo, agg, tasksSeen });
}

if (rows.length === 0) {
  console.log("No suite results found yet.");
  process.exit(0);
}

const fmtAvg = (s) =>
  s.length ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) : "—";
const fmtTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(0)}K` : `${n}`);

const byModel = new Map();
for (const r of rows) {
  if (!byModel.has(r.model)) byModel.set(r.model, []);
  byModel.get(r.model).push(r);
}

for (const [model, list] of [...byModel.entries()].sort()) {
  console.log(`\n### ${model}`);
  console.log("| repo | files | tasks | arm | acc | tokens | tokΔ vs base | tools | errs/to |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const r of list.sort((a, b) => a.repo.localeCompare(b.repo))) {
    for (const m of MODES) {
      const a = r.agg[m];
      if (a.n === 0) continue;
      const d = m === "baseline" ? 0 : a.tok - r.agg.baseline.tok;
      console.log(
        `| ${r.repo} | ${REPO_FILES[r.repo] ?? "?"} | ${r.tasksSeen} | ${m} | ${fmtAvg(a.scores)} | ${fmtTok(a.tok)} | ${m === "baseline" ? "—" : (d >= 0 ? "+" : "") + fmtTok(d)} | ${a.tools} | ${a.errs}/${a.timeouts} |`,
      );
    }
  }
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const r of list) {
    const b = fmtAvg(r.agg.baseline.scores);
    const c = fmtAvg(r.agg.codeatlas.scores);
    const i = fmtAvg(r.agg["codeatlas-intel"].scores);
    if (b === "—" || c === "—") { ties += 1; continue; }
    const best = Math.max(Number(c), Number(i));
    if (best > Number(b)) wins += 1;
    else if (best < Number(b)) losses += 1;
    else ties += 1;
  }
  console.log(
    `**Verdict so far:** codeatlas beats baseline on ${wins} repo(s), loses on ${losses}, tie/insufficient on ${ties}.`,
  );
}
