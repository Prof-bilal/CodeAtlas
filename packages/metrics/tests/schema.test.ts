import { describe, expect, it } from "vitest";
import { createEmptySnapshot, validateSnapshot, METRICS_SCHEMA_VERSION } from "../src/types";

describe("createEmptySnapshot", () => {
  it("creates a valid empty snapshot", () => {
    const snap = createEmptySnapshot("my-repo");
    expect(snap.version).toBe(METRICS_SCHEMA_VERSION);
    expect(snap.repository.name).toBe("my-repo");
    expect(snap.repository.files).toBe(0);
    expect(snap.repository.lines).toBe(0);
    expect(snap.repository.symbols).toBe(0);
    expect(snap.repository.dependencies).toBe(0);
    expect(snap.repository.languages).toEqual({});
    expect(snap.repository.scanCount).toBe(0);
    expect(snap.repository.firstScanAt).toBeNull();
    expect(snap.repository.latestScanAt).toBeNull();
    expect(snap.activity.scans).toBe(0);
    expect(snap.activity.searches).toBe(0);
    expect(snap.activity.contextRequests).toBe(0);
    expect(snap.activity.mcpRequests).toBe(0);
    expect(snap.activity.filesRead).toBe(0);
    expect(snap.activity.filesModified).toBe(0);
    expect(snap.tokens.estimatedBaseline).toBe(0);
    expect(snap.tokens.estimatedCodeatlas).toBe(0);
    expect(snap.tokens.estimatedSaved).toBe(0);
    expect(snap.tokens.savingsPercent).toBe(0);
    expect(snap.performance.averageScanMs).toBe(0);
    expect(snap.performance.averageSearchMs).toBe(0);
    expect(snap.performance.averageContextMs).toBe(0);
    expect(snap.daily).toEqual([]);
  });
});

describe("validateSnapshot", () => {
  it("accepts a valid snapshot", () => {
    const snap = createEmptySnapshot("test");
    expect(validateSnapshot(snap)).toBe(true);
  });

  it("rejects null", () => {
    expect(validateSnapshot(null)).toBe(false);
  });

  it("rejects a string", () => {
    expect(validateSnapshot("hello")).toBe(false);
  });

  it("rejects missing version", () => {
    expect(
      validateSnapshot({
        generatedAt: "",
        repository: {},
        activity: {},
        tokens: {},
        performance: {},
        daily: [],
      }),
    ).toBe(false);
  });

  it("rejects missing repository", () => {
    expect(
      validateSnapshot({
        version: 1,
        generatedAt: "",
        activity: {},
        tokens: {},
        performance: {},
        daily: [],
      }),
    ).toBe(false);
  });

  it("rejects non-array daily", () => {
    expect(
      validateSnapshot({
        version: 1,
        generatedAt: "",
        repository: {},
        activity: {},
        tokens: {},
        performance: {},
        daily: "not-array",
      }),
    ).toBe(false);
  });

  it("accepts a snapshot with daily entries", () => {
    const snap = createEmptySnapshot("test");
    const withDaily = {
      ...snap,
      daily: [
        {
          date: "2026-08-16",
          scans: 1,
          searches: 2,
          contextRequests: 3,
          mcpRequests: 0,
          filesRead: 4,
          filesModified: 0,
          tokensUsed: 100,
          estimatedBaselineTokens: 200,
          estimatedTokensSaved: 100,
        },
      ],
    };
    expect(validateSnapshot(withDaily)).toBe(true);
  });
});
