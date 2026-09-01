// Tests for Phase A task A3 — scoreTaskRetrieval.

import type { TaskDefinition } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { scoreTaskRetrieval } from "../src/retrieval-metrics.js";
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

function task(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id: "t1",
    category: "repository-understanding",
    prompt: "test query",
    expected_files: [],
    expected_concepts: [],
    evaluation_method: "manual",
    ...overrides,
  };
}

function mockSdk(searchFn: () => readonly ReturnType<typeof hit>[]): ContextSDK {
  return { isAvailable: true, search: { search: searchFn } } as unknown as ContextSDK;
}

// --------------------------------------------------------------------------- Tests

describe("scoreTaskRetrieval", () => {
  it("returns zeros when no expected_files are given", () => {
    const result = scoreTaskRetrieval(
      mockSdk(() => []),
      task(),
    );
    expect(result.hitsAtK[1]).toBe(0);
    expect(result.hitsAtK[5]).toBe(0);
    expect(result.retrievedPaths).toEqual([]);
  });

  it("scores a top-1 hit correctly", () => {
    const sdk = mockSdk(() => [hit("src/auth/svc.ts")]);
    const result = scoreTaskRetrieval(
      sdk,
      task({ expected_files: ["src/auth/svc.ts"] }),
      [1, 5, 10],
    );
    expect(result.hitsAtK[1]).toBe(1);
    expect(result.hitsAtK[5]).toBe(1);
    expect(result.ranks["src/auth/svc.ts"]).toBe(1);
  });

  it("scores a miss at k=1 but hit at k=3", () => {
    const sdk = mockSdk(() => [
      hit("src/web/main.ts"),
      hit("src/api/router.ts"),
      hit("src/auth/svc.ts"),
    ]);
    const result = scoreTaskRetrieval(
      sdk,
      task({ expected_files: ["src/auth/svc.ts"] }),
      [1, 3, 10],
    );
    expect(result.hitsAtK[1]).toBe(0);
    expect(result.hitsAtK[3]).toBe(1);
    expect(result.ranks["src/auth/svc.ts"]).toBe(3);
  });

  it("de-duplicates duplicate search results", () => {
    const sdk = mockSdk(() => [
      hit("src/auth/svc.ts"),
      hit("src/auth/svc.ts"),
      hit("src/web/main.ts"),
    ]);
    const result = scoreTaskRetrieval(sdk, task({ expected_files: ["src/auth/svc.ts"] }));
    expect(result.retrievedPaths).toEqual(["src/auth/svc.ts", "src/web/main.ts"]);
    expect(result.ranks["src/auth/svc.ts"]).toBe(1);
  });

  it("handles null paths in search results gracefully", () => {
    const sdk = mockSdk(() => [
      {
        id: "1",
        path: null as unknown as string,
        kind: "file" as const,
        score: 1,
        snippet: "",
        title: "",
        targetId: "1",
      },
      hit("src/core/util.ts"),
    ]);
    const result = scoreTaskRetrieval(sdk, task({ expected_files: ["src/core/util.ts"] }));
    expect(result.retrievedPaths).toEqual(["src/core/util.ts"]);
    expect(result.hitsAtK[5]).toBe(1);
  });

  it("respects custom kValues parameter", () => {
    const sdk = mockSdk(() => [hit("x"), hit("y"), hit("z")]);
    // "y" is at rank 2; k=1 misses, k=2 hits.
    const result = scoreTaskRetrieval(sdk, task({ expected_files: ["y"] }), [1, 2]);
    expect(result.hitsAtK[1]).toBe(0);
    expect(result.hitsAtK[2]).toBe(1);
    expect(Object.keys(result.hitsAtK)).toEqual(["1", "2"]);
  });

  it("records the taskId and category on the result", () => {
    const t = task({ id: "my-id", category: "file-discovery" });
    const result = scoreTaskRetrieval(
      mockSdk(() => []),
      t,
    );
    expect(result.taskId).toBe("my-id");
    expect(result.category).toBe("file-discovery");
  });
});
