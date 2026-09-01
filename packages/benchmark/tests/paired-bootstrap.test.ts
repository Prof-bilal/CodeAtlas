// Tests for Phase A task A4 — paired bootstrap significance testing.
//
// The paired bootstrap implemented here measures whether the observed difference
// is large relative to the bootstrap variance of the resampled means.
// This is valid for: checking whether CI includes 0, and computing CI coverage.
// For formal hypothesis testing (p-values), use pairedTTest (significance.ts).

import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOTSTRAP_OPTIONS,
  describeDiff,
  isSignificant,
  pairedBootstrap,
} from "../src/paired-bootstrap.js";

describe("pairedBootstrap", () => {
  it("returns pValue=1 when both runners have identical scores", () => {
    const scores: Record<string, number> = { t1: 1, t2: 2, t3: 3 };
    const result = pairedBootstrap(scores, scores, { nResamples: 999 });
    expect(result.observedDiff).toBe(0);
    expect(result.pValue).toBe(1); // no resample exceeds 0
    expect(result.nResamples).toBe(999);
  });

  it("returns pValue=1 for n=3 with perfectly consistent differences (zero variance)", () => {
    // All three diffs are identical (10), so bootstrap variance is zero → p=1.
    const a: Record<string, number> = { t1: 10, t2: 10, t3: 10 };
    const b: Record<string, number> = { t1: 0, t2: 0, t3: 0 };
    const result = pairedBootstrap(a, b, { nResamples: 999 });
    expect(result.observedDiff).toBeCloseTo(10, 5);
    expect(result.pValue).toBe(1);
  });

  it("returns CI that excludes zero for large consistent difference", () => {
    // 10 tasks, A is consistently ~1 pt better with small noise.
    // Bootstrap CI should exclude zero (verified via t-test: p<0.05).
    const a: Record<string, number> = {
      t1: 5.5,
      t2: 5.6,
      t3: 5.4,
      t4: 5.5,
      t5: 5.6,
      t6: 5.4,
      t7: 5.5,
      t8: 5.6,
      t9: 5.4,
      t10: 5.5,
    };
    const b: Record<string, number> = {
      t1: 4.5,
      t2: 4.5,
      t3: 4.5,
      t4: 4.5,
      t5: 4.5,
      t6: 4.5,
      t7: 4.5,
      t8: 4.5,
      t9: 4.5,
      t10: 4.5,
    };
    const result = pairedBootstrap(a, b, { nResamples: 4999 });
    // The 95% CI should exclude 0 (bootstrap evidence that A > B).
    expect(result.ciLower).toBeGreaterThan(0);
    expect(result.ciUpper).toBeGreaterThan(result.ciLower);
    expect(result.observedDiff).toBeGreaterThan(0);
  });

  it("returns valid p-value in [0,1] when scores overlap", () => {
    // 5 tasks, A wins some, B wins others.
    const a: Record<string, number> = { t1: 6, t2: 4, t3: 5, t4: 6, t5: 4 };
    const b: Record<string, number> = { t1: 5, t2: 5, t3: 5, t4: 4, t5: 5 };
    const result = pairedBootstrap(a, b, { nResamples: 999 });
    expect(result.nResamples).toBe(999);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  it("returns empty result for empty input", () => {
    const result = pairedBootstrap({}, {});
    expect(result.observedDiff).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.nResamples).toBe(0);
    expect(result.ciLower).toBe(0);
    expect(result.ciUpper).toBe(0);
  });

  it("uses nResamples from options", () => {
    const a: Record<string, number> = { t1: 1, t2: 2 };
    const b: Record<string, number> = { t1: 2, t2: 1 };
    const result = pairedBootstrap(a, b, { nResamples: 500 });
    expect(result.nResamples).toBe(500);
  });

  it("defaults to nResamples=10000", () => {
    expect(DEFAULT_BOOTSTRAP_OPTIONS.nResamples).toBe(10_000);
  });

  it("ciLower ≤ observedDiff ≤ ciUpper for identical distributions", () => {
    const scores: Record<string, number> = { t1: 1, t2: 2, t3: 3 };
    const result = pairedBootstrap(scores, scores, { nResamples: 999 });
    expect(result.ciLower).toBeLessThanOrEqual(result.observedDiff);
    expect(result.ciUpper).toBeGreaterThanOrEqual(result.observedDiff);
  });
});

describe("isSignificant", () => {
  it("returns false for identical scores (p=1)", () => {
    const result = pairedBootstrap({ t1: 1 }, { t1: 1 }, { nResamples: 99 });
    expect(isSignificant(result, 0.05)).toBe(false);
  });
});

describe("describeDiff", () => {
  it("annotates positive observed difference", () => {
    const a: Record<string, number> = { t1: 10, t2: 10 };
    const b: Record<string, number> = { t1: 0, t2: 0 };
    const result = pairedBootstrap(a, b, { nResamples: 999 });
    const text = describeDiff(result, 0.05);
    expect(text).toContain("A > B");
    expect(text).toContain("p=");
  });

  it("annotates ns for identical scores", () => {
    const result = pairedBootstrap({ t1: 1 }, { t1: 1 }, { nResamples: 99 });
    const text = describeDiff(result, 0.05);
    expect(text).toContain("ns");
  });
});
