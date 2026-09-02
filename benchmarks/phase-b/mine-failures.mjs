// Failure mining: scan all benchmark suite task results and surface tasks
// where the baseline arm scored below max (or failed) — i.e. tasks where a
// context engine has headroom to lift a small model.
//
// Usage: node benchmarks/phase-b/mine-failures.mjs [--min-score N] [--json]
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SUITES_DIR = path.join(ROOT, ".codeatlas", "benchmarks", "suites");

const args = process.argv.slice(2);
const minScore = Number(args[args.indexOf("--min-score") + 1] ?? 2);
const asJson = args.includes("--json");

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

const rows = [];
for (const suite of fs.readdirSync(SUITES_DIR).sort()) {
  const tasksDir = path.join(SUITES_DIR, suite, "tasks");
  if (!fs.statSync(path.join(SUITES_DIR, suite)).isDirectory() || !fs.existsSync(tasksDir)) {
    continue;
  }
  const byTask = new Map(); // taskId -> { baseline, codeatlas, intel }
  for (const file of fs.readdirSync(tasksDir)) {
    if (!file.endsWith(".json")) continue;
    const r = readJson(path.join(tasksDir, file));
    if (r === null) continue;
    const key = String(r.taskId).split("@")[0];
    const entry = byTask.get(key) ?? {};
    entry[r.mode] = r;
    byTask.set(key, entry);
  }
  for (const [taskId, arms] of byTask) {
    const b = arms.baseline;
    const baseScore = b?.evaluation?.score;
    const hasEval = baseScore !== undefined && baseScore !== null;
    const baseFailed = b !== undefined && (b.timedOut || b.error !== undefined);
    // Only count as a genuine failure when we have an evaluation proving it,
    // or the run itself failed. Unevaluated legacy results are reported
    // separately (--json includes them with hasEval=false).
    const failed = (hasEval && baseScore < minScore) || baseFailed;
    if (!failed) continue;
    rows.push({
      suite,
      taskId,
      category: b?.category ?? arms.codeatlas?.category ?? "?",
      hasEval,
      baselineScore: baseScore ?? null,
      baselineStatus: b?.evaluation?.status ?? (b?.timedOut ? "timeout" : b?.error !== undefined ? "error" : hasEval ? "scored" : "no-eval"),
      codeatlasScore: arms.codeatlas?.evaluation?.score ?? null,
      intelScore: arms["codeatlas-intel"]?.evaluation?.score ?? null,
      baselineTokens: b?.tokens?.total ?? null,
      codeatlasTokens: arms.codeatlas?.tokens?.total ?? null,
    });
  }
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  const proven = rows.filter((r) => r.hasEval || r.baselineStatus === "timeout" || r.baselineStatus === "error");
  const legacy = rows.filter((r) => !proven.includes(r));
  console.log(`Baseline failures with evaluation proof: ${proven.length}`);
  console.log(`Legacy results without evaluation data (unevaluated): ${legacy.length}`);
  console.log("");
  console.log(
    ["suite", "task", "category", "status", "base", "atlas", "intel", "baseTok", "atlasTok"].join("\t"),
  );
  for (const r of proven.sort((a, b) => (a.suite + a.taskId).localeCompare(b.suite + b.taskId))) {
    console.log(
      [
        r.suite,
        r.taskId,
        r.category,
        r.baselineStatus,
        r.baselineScore ?? "-",
        r.codeatlasScore ?? "-",
        r.intelScore ?? "-",
        r.baselineTokens ?? "-",
        r.codeatlasTokens ?? "-",
      ].join("\t"),
    );
  }
}
