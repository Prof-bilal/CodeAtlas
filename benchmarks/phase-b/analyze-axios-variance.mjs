import { readFileSync, globSync } from "node:fs";

function mean(a) {
  return a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0;
}
function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, n) => s + (n - m) ** 2, 0) / (a.length - 1));
}

const rows = [];
for (const rep of ["rep2", "rep3"]) {
  for (const arm of ["baseline", "codeatlas"]) {
    const files = globSync(`.codeatlas/benchmarks/suites/oc-mimo-axios-${rep}/tasks/*-${arm}.json`);
    for (const f of files) {
      const tid = f.split("/").pop().replace(`-${arm}.json`, "");
      const d = JSON.parse(readFileSync(f, "utf8"));
      rows.push({ tid, rep, arm, dur: d.durationMs / 1000, tok: d.tokens.total, score: d.evaluation.score, to: d.timedOut });
    }
  }
}

console.log("=== oc-mimo-axios variance: rep2 + rep3 (2 full replicates, fixed build) ===");
console.log("task      arm       rep2dur  rep3dur  rep2tok  rep3tok  score");
const byTask = {};
for (const r of rows) { (byTask[r.tid] ||= {})[r.arm] = r; }
for (const tid of Object.keys(byTask).sort()) {
  const b = byTask[tid].baseline, c = byTask[tid].codeatlas;
  console.log(`${tid.padEnd(8)} baseline  ${String(b?.dur).padStart(7)}s           ${String(b?.tok).padStart(7)} ${b?.score}`);
  console.log(`          codeatlas ${String(c?.dur).padStart(7)}s           ${String(c?.tok).padStart(7)} ${c?.score}`);
}
const bdurs = rows.filter(r => r.arm === "baseline").map(r => r.dur);
console.log(`\nBaseline duration: mean=${Math.round(mean(bdurs))}s stdev=${Math.round(stddev(bdurs))}s (n=${bdurs.length} arms)`);
const cdurs = rows.filter(r => r.arm === "codeatlas").map(r => r.dur);
console.log(`CodeAtlas duration: mean=${Math.round(mean(cdurs))}s stdev=${Math.round(stddev(cdurs))}s (n=${cdurs.length} arms)`);
console.log("(rep1 partial 3/16 — watchdog-salvaged; excluded from variance)");
