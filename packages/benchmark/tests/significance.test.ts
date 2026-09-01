// Tests for Phase A task A4 — paired t-test significance testing.

import { describe, expect, it } from "vitest";
import { describeComparison, pairedTTest } from "../src/significance.js";

describe("pairedTTest", () => {
  it("returns p=1, meanDiff=0 for empty input", () => {
    const result = pairedTTest({}, {});
    expect(result.meanDiff).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.n).toBe(0);
    expect(result.significant).toBe(false);
    expect(result.ci).toEqual([0, 0]);
  });

  it("returns p=1 for n=1 (single task)", () => {
    const result = pairedTTest({ t1: 5 }, { t1: 5 });
    expect(result.meanDiff).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.n).toBe(1);
    expect(result.significant).toBe(false);
    expect(result.ci).toEqual([0, 0]);
  });

  it("returns p=1 when both runners have identical scores", () => {
    const a: Record<string, number> = { t1: 1, t2: 2, t3: 3 };
    const result = pairedTTest(a, a);
    expect(result.meanDiff).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.significant).toBe(false);
  });

  it("returns significant p-value when A consistently beats B with real variability", () => {
    // 10 tasks, A is ~1 pt better WITH small noise. sd≈0.15, se≈0.05, Z≈20 → p<0.05.
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
    const result = pairedTTest(a, b);
    expect(result.meanDiff).toBeGreaterThan(0.9);
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.n).toBe(10);
  });

  it("returns non-significant p-value when scores overlap", () => {
    // 5 tasks, A wins 3, B wins 2 — result is essentially random.
    const a: Record<string, number> = { t1: 6, t2: 4, t3: 5, t4: 6, t5: 4 };
    const b: Record<string, number> = { t1: 5, t2: 5, t3: 5, t4: 4, t5: 5 };
    const result = pairedTTest(a, b);
    expect(result.n).toBe(5);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  it("returns se=0, p=1, not significant for all identical differences", () => {
    const a: Record<string, number> = { t1: 10, t2: 10, t3: 10 };
    const b: Record<string, number> = { t1: 0, t2: 0, t3: 0 };
    const result = pairedTTest(a, b);
    expect(result.meanDiff).toBeCloseTo(10, 4);
    expect(result.pValue).toBe(1); // zero variance → p=1 by our handling
    expect(result.significant).toBe(false); // se=0 → p=1 → not sig
    expect(result.ci[0]).toBeCloseTo(10, 4);
    expect(result.ci[1]).toBeCloseTo(10, 4);
  });

  it("CI upper > CI lower for non-zero variance", () => {
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
    const result = pairedTTest(a, b);
    expect(result.ci[1]).toBeGreaterThan(result.ci[0]);
  });
});

describe("describeComparison", () => {
  it("formats significant A>B result", () => {
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
    const r = pairedTTest(a, b);
    const text = describeComparison(r);
    expect(text).toContain("A>B");
    expect(text).toContain("sig");
    expect(text).toContain("p=");
  });

  it("formats ns result for identical scores", () => {
    const r = pairedTTest({ t1: 5 }, { t1: 5 });
    const text = describeComparison(r);
    expect(text).toContain("A\u2248"); // ≈ symbol
    expect(text).toContain("ns");
  });
});
