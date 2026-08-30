import { describe, expect, it } from "vitest";
import { evaluateSufficiency } from "../src/context-integration/sufficiency";

const base = {
  isCodeModification: true,
  criticalCount: 2,
  closureDependencyCount: 3,
  isMultiFileTask: true,
} as const;

describe("evaluateSufficiency", () => {
  it("passes when all predicates hold", () => {
    const result = evaluateSufficiency({
      ...base,
      planTargets: ["src/auth.ts", "authenticate"],
      indexedPaths: ["src/auth.ts"],
      indexedSymbolNames: ["authenticate"],
      searchHits: [{ path: "src/auth.ts", score: 3 }],
    });
    expect(result.sufficient).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when the plan references files missing from the index", () => {
    const result = evaluateSufficiency({
      ...base,
      planTargets: ["src/missing.ts"],
      indexedPaths: ["src/auth.ts"],
    });
    expect(result.sufficient).toBe(false);
    expect(result.failures[0]?.predicate).toBe("unknown-plan-target");
    expect(result.nextSteps.length).toBeGreaterThan(0);
  });

  it("fails when the plan references unknown symbols", () => {
    const result = evaluateSufficiency({
      ...base,
      planTargets: ["MissingService"],
      indexedSymbolNames: ["AuthService"],
    });
    expect(result.failures[0]?.predicate).toBe("unknown-plan-target");
  });

  it("fails when no search hit clears the min score", () => {
    const result = evaluateSufficiency({
      ...base,
      searchHits: [
        { path: "src/weak.ts", score: 0.5 },
        { path: null, score: 9 },
      ],
    });
    expect(result.failures[0]?.predicate).toBe("no-strong-hit");
  });

  it("honors a custom min score", () => {
    const result = evaluateSufficiency({
      ...base,
      searchHits: [{ path: "src/auth.ts", score: 2 }],
      minScore: 5,
    });
    expect(result.failures[0]?.predicate).toBe("no-strong-hit");
  });

  it("fails when the critical tier is empty for a code-modification task", () => {
    const result = evaluateSufficiency({ ...base, criticalCount: 0 });
    expect(result.failures[0]?.predicate).toBe("empty-critical-tier");
  });

  it("does not require a critical tier for comprehension tasks", () => {
    const result = evaluateSufficiency({
      ...base,
      criticalCount: 0,
      isCodeModification: false,
    });
    expect(result.sufficient).toBe(true);
  });

  it("fails on a zero-dependency closure for a multi-file task", () => {
    const result = evaluateSufficiency({
      ...base,
      closureDependencyCount: 0,
    });
    expect(result.failures[0]?.predicate).toBe("zero-closure-dependencies");
  });

  it("collects multiple failures at once", () => {
    const result = evaluateSufficiency({
      isCodeModification: true,
      criticalCount: 0,
      closureDependencyCount: 0,
      isMultiFileTask: true,
      searchHits: [],
      planTargets: ["src/ghost.ts"],
    });
    expect(result.sufficient).toBe(false);
    expect(result.failures).toHaveLength(4);
    expect(result.nextSteps).toHaveLength(4);
  });

  it("is deterministic", () => {
    const input = {
      ...base,
      planTargets: ["src/auth.ts"],
      indexedPaths: ["src/auth.ts"],
      searchHits: [{ path: "src/auth.ts", score: 2 }],
    };
    expect(evaluateSufficiency(input)).toEqual(evaluateSufficiency(input));
  });
});
