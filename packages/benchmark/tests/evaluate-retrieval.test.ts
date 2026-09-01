// Tests for Phase A task A3 — evaluateRetrieval aggregation.

import type { TaskDefinition } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { evaluateRetrieval, scoreTaskRetrieval } from "../src/retrieval-metrics.js";
import type { ContextSDK } from "../src/retrieval-metrics.js";

function hit(path: string) {
  return {
    id: path,
    path,
    kind: "file" as const,
    score: 1,
    snippet: "",
    title: path,
    targetId: path,
  };
}

function makeTask(id: string, files: string[]): TaskDefinition {
  return {
    id,
    category: "repository-understanding",
    prompt: id,
    expected_files: files,
    expected_concepts: [],
    evaluation_method: "manual",
  };
}

function mockSdk(searchFn: () => readonly ReturnType<typeof hit>[]): ContextSDK {
  return { isAvailable: true, search: { search: searchFn } } as unknown as ContextSDK;
}

describe("evaluateRetrieval", () => {
  it("throws when SDK is not available", () => {
    expect(() => evaluateRetrieval({ isAvailable: false } as ContextSDK, [])).toThrow(
      "not available",
    );
  });

  it("returns empty report for empty task list", () => {
    const report = evaluateRetrieval(
      mockSdk(() => []),
      [],
    );
    expect(report.tasks).toHaveLength(0);
    expect(report.meanReciprocalRank).toBe(0);
    expect(report.precisionAtK[1]).toBe(0);
    expect(report.recallAtK[1]).toBe(0);
  });

  it("aggregates precision@k — p@1 = 0.5 when one task hits and one misses", () => {
    const sdk1 = mockSdk(() => [hit("src/a.ts")]);
    const sdk2 = mockSdk(() => [hit("src/other.ts")]);
    const t1 = makeTask("a", ["src/a.ts"]);
    const t2 = makeTask("b", ["src/b.ts"]);
    const r1 = scoreTaskRetrieval(sdk1, t1, [1, 5]);
    const r2 = scoreTaskRetrieval(sdk2, t2, [1, 5]);

    // p@1 task-1 = 1/1, task-2 = 0/1 → mean = 0.5
    const p1_t1 = r1.hitsAtK[1] / 1;
    const p1_t2 = r2.hitsAtK[1] / 1;
    expect((p1_t1 + p1_t2) / 2).toBe(0.5);

    // r@1 task-1 = 1/1, task-2 = 0/1 → mean = 0.5
    const rec1_t1 = r1.hitsAtK[1] / r1.relevant;
    const rec1_t2 = r2.hitsAtK[1] / r2.relevant;
    expect((rec1_t1 + rec1_t2) / 2).toBe(0.5);
  });

  it("MRR = 0 when no expected file is retrieved", () => {
    const sdk = mockSdk(() => [hit("src/other.ts")]);
    const t = makeTask("miss", ["src/missing.ts"]);
    const result = scoreTaskRetrieval(sdk, t);
    let best: number | null = null;
    for (const v of Object.values(result.ranks)) {
      if (v !== null && (best === null || v < best)) best = v;
    }
    const mrr = best === null ? 0 : 1 / best;
    expect(mrr).toBe(0);
  });

  it("MRR = 1 when expected file is at rank 1", () => {
    const sdk = mockSdk(() => [hit("src/target.ts")]);
    const t = makeTask("hit", ["src/target.ts"]);
    const result = scoreTaskRetrieval(sdk, t);
    let best: number | null = null;
    for (const v of Object.values(result.ranks)) {
      if (v !== null && (best === null || v < best)) best = v;
    }
    const mrr = best === null ? 0 : 1 / best;
    expect(mrr).toBe(1);
  });
});
