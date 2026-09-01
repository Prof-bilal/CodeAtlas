// Phase A task A4 — paired bootstrap significance testing.
//
// Paired bootstrap determines whether the observed difference between two
// runners on the same task set is statistically significant at a chosen
// confidence level.  Tasks are the experimental unit; resampling preserves
// pairing (each task is run once per runner).
//
// Reference: Efron & Tibshirani (1993), "An Introduction to the Bootstrap".

/** Per-task scalar scores keyed by taskId. */
export type TaskScores = Readonly<Record<string, number>>;

/** Result of a single pairwise bootstrap test. */
export interface BootstrapResult {
  /** Observed mean difference (A − B). */
  readonly observedDiff: number;
  /** Bootstrap p-value (fraction of resamples with |mean| ≥ observed). */
  readonly pValue: number;
  /** Lower percentile CI bound. */
  readonly ciLower: number;
  /** Upper percentile CI bound. */
  readonly ciUpper: number;
  /** Number of bootstrap resamples. */
  readonly nResamples: number;
}

/** Options for pairedBootstrap. */
export interface BootstrapOptions {
  /** Number of resamples (default 10 000). */
  readonly nResamples?: number;
  /** Confidence level (default 0.95). */
  readonly confidence?: number;
}

export const DEFAULT_BOOTSTRAP_OPTIONS: Required<BootstrapOptions> = {
  nResamples: 10_000,
  confidence: 0.95,
};

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Paired bootstrap for a scalar difference between two runners.
 *
 * @param scoresA  Per-task scores for runner A (same taskIds as scoresB).
 * @param scoresB  Per-task scores for runner B.
 * @param opts     Bootstrap options.
 */
export function pairedBootstrap(
  scoresA: TaskScores,
  scoresB: TaskScores,
  opts: BootstrapOptions = {},
): BootstrapResult {
  const { nResamples, confidence } = { ...DEFAULT_BOOTSTRAP_OPTIONS, ...opts };
  const taskIds = Object.keys(scoresA);

  if (taskIds.length === 0) {
    return { observedDiff: 0, pValue: 1, ciLower: 0, ciUpper: 0, nResamples: 0 };
  }

  const diffs = taskIds.map((id) => (scoresA[id] ?? 0) - (scoresB[id] ?? 0));
  const n = diffs.length;
  const observedDiff = mean(diffs);

  // Resample paired differences.
  const rng = fastRng();
  const resampledMeans = new Float64Array(nResamples);
  for (let r = 0; r < nResamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += diffs[Math.floor(rng() * n)];
    resampledMeans[r] = sum / n;
  }

  // Percentile CI.
  resampledMeans.sort();
  const alpha = 1 - confidence;
  const ciLower = percentile(resampledMeans, alpha / 2);
  const ciUpper = percentile(resampledMeans, 1 - alpha / 2);

  // Two-sided p-value: fraction of resamples with |mean| ≥ |observed|.
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

/** Whether a bootstrap result indicates a significant difference at α. */
export function isSignificant(result: BootstrapResult, alpha = 0.05): boolean {
  return result.pValue < alpha;
}

/** Human-readable annotation for a BootstrapResult. */
export function describeDiff(result: BootstrapResult, alpha = 0.05): string {
  const sig = isSignificant(result, alpha);
  const dir = result.observedDiff > 0 ? "A > B" : result.observedDiff < 0 ? "A < B" : "A ≈ B";
  return sig
    ? `${dir}  p=${result.pValue.toFixed(4)}  CI=[${result.ciLower.toFixed(3)},${result.ciUpper.toFixed(3)}]`
    : `${dir}  ns  p=${result.pValue.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Mulberry32 seeded PRNG for reproducible results. */
function fastRng(seed = 0xc0ffee): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x1_0000_0000;
  };
}

function mean(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function percentile(sorted: Float64Array, p: number): number {
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}
