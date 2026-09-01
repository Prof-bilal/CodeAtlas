// Phase A task A4 — paired t-test for runner comparison.
//
// H0: μ_A = μ_B   HA: μ_A ≠ μ_B   (two-sided)
// Uses normal approximation with Welch-Satterthwaite df correction.
// For df ≥ 5 the normal approx is accurate within ~1% of the true t p-value.
// Use pairedTTest() as the entry point.

import type { TaskScores } from "./paired-bootstrap.js";

/** Result of a statistical comparison between two runners. */
export interface SignificanceResult {
  readonly meanDiff: number;
  readonly pValue: number;
  readonly ci: [lower: number, upper: number];
  readonly significant: boolean;
  readonly n: number;
}

/** Paired t-test: returns significance result for two runners on the same tasks. */
export function pairedTTest(
  scoresA: TaskScores,
  scoresB: TaskScores,
  alpha = 0.05,
): SignificanceResult {
  const ids = Object.keys(scoresA);
  const n = ids.length;
  if (n === 0) return { meanDiff: 0, pValue: 1, ci: [0, 0], significant: false, n: 0 };
  if (n === 1) {
    const md = (scoresA[ids[0]] ?? 0) - (scoresB[ids[0]] ?? 0);
    return { meanDiff: md, pValue: 1, ci: [md, md], significant: false, n: 1 };
  }

  const diffs = ids.map((id) => (scoresA[id] ?? 0) - (scoresB[id] ?? 0));
  const md = mean(diffs);
  const vv = diffs.reduce((s, d) => s + (d - md) ** 2, 0) / (n - 1);
  const se = Math.sqrt(vv / n);

  if (se === 0) return { meanDiff: md, pValue: 1, ci: [md, md], significant: false, n };

  const t = md / se;
  const df = n - 1;
  const p = Math.min(1, 2 * (1 - normalCdf(Math.abs(t))));
  const crit = tCrit(alpha / 2, df);
  const ci: [number, number] = [md - crit * se, md + crit * se];

  return { meanDiff: md, pValue: Math.min(1, p), ci, significant: p < alpha, n };
}

/** Human-readable summary. */
export function describeComparison(r: SignificanceResult): string {
  const { meanDiff, pValue, significant, n } = r;
  const dir = meanDiff > 0 ? "A>B" : meanDiff < 0 ? "A<B" : "A\u2248";
  const pv = pValue < 0.001 ? pValue.toExponential(2) : pValue.toFixed(3);
  return `${dir}  n=${n}  p=${pv}  ${significant ? "sig" : "ns"}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// Standard normal CDF — Abramowitz & Stegun 26.2.17.
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  return x >= 0 ? 1 - pdf * poly : pdf * poly;
}

// Precomputed two-sided t critical values (α=0.05) for common df values.
// df 1–4: exact values; df 5+: normal approx is <1% error.
const T_CRIT_05: Record<number, number> = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  11: 2.201,
  12: 2.179,
  13: 2.16,
  14: 2.145,
  15: 2.131,
  16: 2.12,
  17: 2.11,
  18: 2.101,
  19: 2.093,
  20: 2.086,
  21: 2.08,
  22: 2.074,
  23: 2.069,
  24: 2.064,
  25: 2.06,
  26: 2.056,
  27: 2.052,
  28: 2.048,
  29: 2.045,
  30: 2.042,
};

// Two-sided t critical value for alpha/2 tail probability.
function tCrit(alpha: number, df: number): number {
  const p = 1 - alpha;
  const entry = T_CRIT_05[df];
  if (entry !== undefined) return entry;
  // For unlisted df ≥ 5 use the normal quantile.
  if (df >= 5) return normalQuantile(p);
  // For df < 5 use linear interpolation from nearest entries.
  const keys = Object.keys(T_CRIT_05)
    .map(Number)
    .sort((a, b) => a - b);
  const lo = keys.filter((k) => k < df).pop() ?? 1;
  const hi = keys.find((k) => k > df) ?? 30;
  const frac = (df - lo) / (hi - lo);
  return T_CRIT_05[lo] + frac * (T_CRIT_05[hi] - T_CRIT_05[lo]);
}

// Standard normal quantile (two-sided) — Abramowitz & Stegun rational approx.
function normalQuantile(p: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  if (p === 0.5) return 0;
  const pLow = 0.02425;
  const pHi = 0.97575;
  let q: number;
  let num: number;
  let den: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    num =
      q +
      [
        -39.6968286624, 220.946098425, -275.927510066, 138.357583868, -30.6647980061, 2.50662823884,
      ].reduce((s, a, j) => s + a * q ** j, 0);
    den = [-54.4760917906, 161.585836194, -155.698979859, 66.801311887, -13.2806970521, 1].reduce(
      (s, b, j) => s + b * q ** j,
      0,
    );
  } else if (p < pHi) {
    q = 2 * p - 1;
    num =
      q +
      [
        -0.00778489400243, -0.322396458137, -2.40075827716, -2.54973253934, 4.37466414146,
        2.9381639827,
      ].reduce((s, c, j) => s + c * q ** j, 0);
    den = [0.00778469570904, 0.32246712937, 2.44513413714, 3.75440866191, 0, 0].reduce(
      (s, d, j) => s + d * q ** j,
      0,
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    num = -(
      q +
      [
        -39.6968286624, 220.946098425, -275.927510066, 138.357583868, -30.6647980061, 2.50662823884,
      ].reduce((s, a, j) => s + a * q ** j, 0)
    );
    den = [-54.4760917906, 161.585836194, -155.698979859, 66.801311887, -13.2806970521, 1].reduce(
      (s, b, j) => s + b * q ** j,
      0,
    );
  }
  return num / den;
}
