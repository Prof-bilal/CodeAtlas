import { describe, expect, it } from "vitest";
import { estimateTokens, estimateBaselineTokens, calculateSavings } from "../src/token-estimation";

describe("estimateTokens", () => {
  it("estimates tokens from text using char/4 heuristic", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("ab")).toBe(1); // ceil(2/4)
    expect(estimateTokens("abcd")).toBe(1); // ceil(4/4)
    expect(estimateTokens("abcde")).toBe(2); // ceil(5/4)
  });

  it("estimates a large text", () => {
    const text = "a".repeat(1000);
    expect(estimateTokens(text)).toBe(250);
  });
});

describe("estimateBaselineTokens", () => {
  it("calculates baseline from lines and avg chars", () => {
    // 1000 lines × 40 chars / 4 = 10000 tokens
    expect(estimateBaselineTokens(1000, 40)).toBe(10000);
  });

  it("uses default 40 chars per line", () => {
    expect(estimateBaselineTokens(100)).toBe(1000);
  });

  it("handles zero lines", () => {
    expect(estimateBaselineTokens(0)).toBe(0);
  });
});

describe("calculateSavings", () => {
  it("calculates savings correctly", () => {
    const result = calculateSavings(1000, 400);
    expect(result.saved).toBe(600);
    expect(result.percent).toBe(60);
  });

  it("handles zero baseline (no division by zero)", () => {
    const result = calculateSavings(0, 0);
    expect(result.saved).toBe(0);
    expect(result.percent).toBe(0);
  });

  it("handles case where CodeAtlas uses more than baseline", () => {
    const result = calculateSavings(100, 200);
    expect(result.saved).toBe(0);
    expect(result.percent).toBe(0);
  });

  it("calculates exact percentage", () => {
    // baseline = 1245000, codeatlas = 382000
    // saved = 863000, percent = (863000 / 1245000) * 100 = 69.32%
    const result = calculateSavings(1_245_000, 382_000);
    expect(result.saved).toBe(863_000);
    expect(result.percent).toBeCloseTo(69.32, 1);
  });

  it("handles large numbers", () => {
    const result = calculateSavings(10_000_000, 2_000_000);
    expect(result.saved).toBe(8_000_000);
    expect(result.percent).toBe(80);
  });

  it("handles 100% savings", () => {
    const result = calculateSavings(1000, 0);
    expect(result.saved).toBe(1000);
    expect(result.percent).toBe(100);
  });

  it("handles 0% savings", () => {
    const result = calculateSavings(1000, 1000);
    expect(result.saved).toBe(0);
    expect(result.percent).toBe(0);
  });
});
