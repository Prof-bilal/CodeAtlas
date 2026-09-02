// Phase B validation analysis:
//  1) Strength uplift: hard-nemotron-* suites (weak model, tasks where the
//     stronger mimo baseline failed) — accuracy baseline vs codeatlas.
//  2) Variance: oc-mimo-axios (rep0) + oc-mimo-axios-rep1..3 — per-arm
//     mean/std/CV for tokens, duration, accuracy.
// Usage: node benchmarks/phase-b/analyze-phase-b.mjs
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SUITES = path.join(ROOT, ".codeatlas", "benchmarks", "suites");

function loadResults(suite) {
  const dir = path.join(SUITES, suite, "tasks");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const fmt = (v, d = 0) =>
  typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: d }) : "-";

// ---------- 1) Strength uplift ----------
console.log("== 1) Strength uplift (weak model on mined hard tasks) ==");
console.log("suite\ttask\tbase\tscore_b\tscore_a\tverdict");
let liftWins = 0, liftTotal = 0;
for (const suite of ["hard-nemotron-winston", "hard-nemotron-commander", "hard-nemotron-axios", "hard-nemotron-rxjs"]) {
  const byTask = new Map();
  for (const r of loadResults(suite)) {
    const k = String(r.taskId).split("@")[0];
    const e = byTask.get(k) ?? {};
    e[r.mode] = r;
    byTask.set(k, e);
  }
  for (const [task, arms] of [...byTask].sort()) {
    const b = arms.baseline, a = arms.codeatlas;
    if (!b || !a) { console.log(`${suite}\t${task}\tincomplete`); continue; }
    const sb = b.evaluation?.score, sa = a.evaluation?.score;
    const verdict =
      sb !== undefined && sa !== undefined
        ? sa > sb ? "LIFT" : sa < sb ? "REGRESS" : "same"
        : b.error !== undefined || b.timedOut ? "baseline-failed" : "?";
    if (verdict === "LIFT") liftWins++;
    if (verdict !== "?" && verdict !== "incomplete") liftTotal++;
    console.log(
      `${suite}\t${task}\t${b.evaluation?.status ?? b.error ?? (b.timedOut ? "timeout" : "?")}\t${sb ?? "-"}\t${sa ?? "-"}\t${verdict}`,
    );
  }
}
console.log(`\nUplift: ${liftWins}/${liftTotal} hard tasks improved by CodeAtlas context\n`);

// ---------- 2) Variance ----------
console.log("== 2) Variance across axios replicates (2 arms) ==");
const reps = ["oc-mimo-axios", "oc-mimo-axios-rep1", "oc-mimo-axios-rep2", "oc-mimo-axios-rep3"]
  .filter((s) => fs.existsSync(path.join(SUITES, s)));
const perArm = { baseline: { tokens: [], dur: [], scores: [] }, codeatlas: { tokens: [], dur: [], scores: [] } };
for (const s of reps) {
  for (const r of loadResults(s)) {
    const arm = perArm[r.mode];
    if (!arm) continue;
    arm.tokens.push(r.tokens.total);
    arm.dur.push(r.durationMs);
    if (r.evaluation?.score !== undefined) arm.scores.push(r.evaluation.score);
  }
}
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const std = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
console.log(`replicates used: ${reps.length} (${reps.join(", ")})`);
console.log("arm\ttokens mean\ttokens CV\tdur mean(s)\tdur CV\taccuracy mean\taccuracy CV");
for (const [arm, a] of Object.entries(perArm)) {
  if (a.tokens.length === 0) continue;
  const cv = (xs) => std(xs) / mean(xs);
  console.log(
    [
      arm,
      fmt(mean(a.tokens)),
      `${(cv(a.tokens) * 100).toFixed(1)}%`,
      (mean(a.dur) / 1000).toFixed(1),
      `${(cv(a.dur) * 100).toFixed(1)}%`,
      a.scores.length ? mean(a.scores).toFixed(2) : "-",
      a.scores.length > 1 ? `${(cv(a.scores) * 100).toFixed(1)}%` : "-",
    ].join("\t"),
  );
}
