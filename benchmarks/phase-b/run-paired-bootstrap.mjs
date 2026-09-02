// Phase B task C-A3: Run paired bootstrap on final data
// This script extracts per-task scores from raw-results.json and runs
// the paired bootstrap test to assess statistical significance.
//
// Usage: node benchmarks/phase-b/run-paired-bootstrap.mjs
import * as fs from "node:fs";
import { dirname, join as pathJoin, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const SUITES = pathJoin(ROOT, ".codeatlas", "benchmarks", "suites");

// Simple seeded PRNG for reproducibility
function createRng(seed = 0xc0ffee) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x1_0000_0000;
  };
}

// Pair bootstrap implementation
function pairedBootstrap(scoresA, scoresB, nResamples = 10000, confidence = 0.95) {
  const taskIds = Object.keys(scoresA);
  if (taskIds.length === 0) {
    return { observedDiff: 0, pValue: 1, ciLower: 0, ciUpper: 0, nResamples: 0 };
  }

  // Compute per-task differences
  const diffs = taskIds.map((id) => (scoresA[id] ?? 0) - (scoresB[id] ?? 0));
  const n = diffs.length;
  const observedDiff = diffs.reduce((a, b) => a + b, 0) / n;

  // Resample paired differences
  const rng = createRng();
  const resampledMeans = new Float64Array(nResamples);
  for (let r = 0; r < nResamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += diffs[Math.floor(rng() * n)];
    resampledMeans[r] = sum / n;
  }

  // Percentile CI
  resampledMeans.sort();
  const alpha = 1 - confidence;
  const ciLower = resampledMeans[Math.floor(alpha / 2 * nResamples)];
  const ciUpper = resampledMeans[Math.floor((1 - alpha / 2) * nResamples)];

  // Two-sided p-value
  const absObserved = Math.abs(observedDiff);
  let exceedCount = 0;
  for (let r = 0; r < nResamples; r++) {
    if (Math.abs(resampledMeans[r]) >= absObserved) exceedCount++;
  }

  return {
    observedDiff,
    pValue: exceedCount / nResamples,
    ciLower,
    ciUpper,
    nResamples,
  };
}

function describeDiff(result, alpha = 0.05) {
  const sig = result.pValue < alpha;
  const dir = result.observedDiff > 0 ? "A > B" : result.observedDiff < 0 ? "A < B" : "A ≈ B";
  return sig
    ? `${dir}  p=${result.pValue.toFixed(4)}  CI=[${result.ciLower.toFixed(3)},${result.ciUpper.toFixed(3)}]`
    : `${dir}  ns  p=${result.pValue.toFixed(4)}`;
}

// Load raw results from a suite
function loadRawResults(suiteId) {
  const filePath = pathJoin(SUITES, suiteId, "raw-results.json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// Aggregate runs per task (for suites with runsPerTask > 1)
function aggregateScores(rawResults) {
  const baselineByTask = {}, codeatlasByTask = {};
  const baselineRuns = {}, codeatlasRuns = {};

  for (const t of rawResults.tasks) {
    const taskId = t.taskId.split("#")[0]; // Strip run suffix if present
    const score = t.evaluation?.score ?? 0;

    if (t.mode === "baseline") {
      baselineByTask[taskId] = score;
      baselineRuns[taskId] = baselineRuns[taskId] ?? [];
      baselineRuns[taskId].push(score);
    } else if (t.mode === "codeatlas") {
      codeatlasByTask[taskId] = score;
      codeatlasRuns[taskId] = codeatlasRuns[taskId] ?? [];
      codeatlasRuns[taskId].push(score);
    }
  }

  return { baselineByTask, codeatlasByTask, baselineRuns, codeatlasRuns };
}

// Analysis for a single suite
function analyzeSuite(suiteId) {
  const raw = loadRawResults(suiteId);
  if (!raw) {
    console.log(`  ${suiteId}: NOT FOUND`);
    return null;
  }

  const { baselineByTask, codeatlasByTask } = aggregateScores(raw);
  const taskIds = Object.keys(baselineByTask);
  if (taskIds.length === 0) {
    console.log(`  ${suiteId}: No tasks found`);
    return null;
  }

  // Check if we have paired data (same tasks in both modes)
  const baselineTasks = new Set(Object.keys(baselineByTask));
  const codeatlasTasks = new Set(Object.keys(codeatlasByTask));
  const pairedTasks = [...baselineTasks].filter((id) => codeatlasTasks.has(id));

  if (pairedTasks.length === 0) {
    console.log(`  ${suiteId}: No paired baseline+codeatlas tasks`);
    return null;
  }

  // Build paired scores for bootstrap
  const baselineScores = {};
  const codeatlasScores = {};
  for (const id of pairedTasks) {
    baselineScores[id] = baselineByTask[id];
    codeatlasScores[id] = codeatlasByTask[id];
  }

  // Run paired bootstrap
  const result = pairedBootstrap(baselineScores, codeatlasScores);

  return {
    suiteId,
    nTasks: pairedTasks.length,
    baselineMean: Object.values(baselineScores).reduce((a, b) => a + b, 0) / pairedTasks.length,
    codeatlasMean: Object.values(codeatlasScores).reduce((a, b) => a + b, 0) / pairedTasks.length,
    result,
  };
}

// Main analysis
console.log("=== Paired Bootstrap Significance Testing ===\n");

const targetSuites = [
  "oc-mimo-commander",
  "oc-mimo-axios-rep2",
  "oc-mimo-axios-rep3",
  "oc-mimo-winston",
  "oc-mimo-rxjs",
];

const results = [];
for (const suite of targetSuites) {
  const r = analyzeSuite(suite);
  if (r) {
    results.push(r);
  }
}

// Group summary
console.log("\n=== Results by Suite ===\n");
console.log("suite\t\tn\ttask\tacc.diff\tp-value\t\tsignificance");

for (const r of results) {
  const sig = r.result.pValue < 0.05 ? "✓ SIGNIFICANT" : "✗ not sig";
  console.log(
    `${r.suiteId}\t\t${r.nTasks}\t${r.baselineMean.toFixed(2)}\t${r.codeatlasMean.toFixed(2)}\t\t${r.result.pValue.toFixed(4)}\t ${sig}`
  );
}

console.log("\n=== Interpretation ===");
const significantSuites = results.filter((r) => r.result.pValue < 0.05);
const liftSuites = results.filter((r) => r.result.observedDiff > 0);

console.log(`Total suites analyzed: ${results.length}`);
console.log(`Significant (p < 0.05): ${significantSuites.length}`);
console.log(`CodeAtlas shows lift (positive diff): ${liftSuites.length}`);

for (const r of results) {
  console.log(`\n${r.suiteId}:`);
  console.log(`  Description: ${describeDiff(r.result)}`);
  console.log(`  95% CI: [${r.result.ciLower.toFixed(3)}, ${r.result.ciUpper.toFixed(3)}]`);
}

// Export for verification
const outputPath = pathJoin(SUITES, "paired-bootstrap-results.json");
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      results: results.map((r) => ({
        suiteId: r.suiteId,
        nTasks: r.nTasks,
        baselineMean: r.baselineMean,
        codeatlasMean: r.codeatlasMean,
        observedDiff: r.result.observedDiff,
        pValue: r.result.pValue,
        ciLower: r.result.ciLower,
        ciUpper: r.result.ciUpper,
        significant: r.result.pValue < 0.05,
      })),
    },
    null,
    2
  )
);
console.log(`\nResults written to: ${outputPath}`);