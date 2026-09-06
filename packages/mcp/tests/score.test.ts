import { describe, expect, it } from "vitest";
import { confidenceFromScore, normalizeScore, toInternalMinScore } from "../src/score";

describe("score normalization (Phase 1 truth-in-advertising)", () => {
  it("normalizes lexical 0..100 scores to the 0..1 MCP contract", () => {
    expect(normalizeScore(100).score).toBe(1);
    expect(normalizeScore(85).score).toBe(0.85);
    expect(normalizeScore(0).score).toBe(0);
    expect(normalizeScore(54).score).toBe(0.54);
  });

  it("dual-emits the raw 0..100 value during deprecation", () => {
    const normalized = normalizeScore(75);
    expect(normalized.rawScore).toBe(75);
    expect(normalized.score).toBe(0.75);
  });

  it("treats already-normalized (≤1) inputs consistently", () => {
    const normalized = normalizeScore(0.8);
    expect(normalized.score).toBe(0.8);
    // rawScore is on the legacy 0..100 scale, so 0.8 maps back to 80.
    expect(normalized.rawScore).toBe(80);
  });

  it("clamps out-of-range and non-finite scores into the 0..1 band", () => {
    expect(normalizeScore(250).score).toBe(1);
    expect(normalizeScore(-20).score).toBe(0);
    // Non-finite scores fail closed to 0 (lowest confidence), never NaN.
    expect(normalizeScore(Number.NaN).score).toBe(0);
    expect(normalizeScore(Number.POSITIVE_INFINITY).score).toBe(0);
  });

  it("maps scores to coarse confidence bands", () => {
    expect(confidenceFromScore(1)).toBe("high");
    expect(confidenceFromScore(0.85)).toBe("high");
    expect(confidenceFromScore(0.84)).toBe("medium");
    expect(confidenceFromScore(0.5)).toBe("medium");
    expect(confidenceFromScore(0.49)).toBe("low");
    expect(confidenceFromScore(0)).toBe("low");
  });

  it("keeps the normalized score and confidence band consistent", () => {
    for (const raw of [100, 90, 75, 60, 50, 40, 25, 0]) {
      const normalized = normalizeScore(raw);
      expect(normalized.confidence).toBe(confidenceFromScore(normalized.score));
    }
  });

  it("converts client 0..1 minScore to the internal 0..100 scale", () => {
    expect(toInternalMinScore(0)).toBe(0);
    expect(toInternalMinScore(0.5)).toBe(50);
    expect(toInternalMinScore(1)).toBe(100);
    // Values >1 are legacy 0..100 and pass through unchanged.
    expect(toInternalMinScore(80)).toBe(80);
    expect(toInternalMinScore(Number.NaN)).toBe(0);
    expect(toInternalMinScore(-3)).toBe(0);
  });
});
