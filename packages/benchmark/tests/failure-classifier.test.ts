import type { BenchmarkEvaluation, BenchmarkTaskResult, TokenMetrics } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { classifyAllFailures, classifyFailure } from "../src/failure-classifier";

function makeMetrics(overrides?: Partial<TokenMetrics>): TokenMetrics {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    total: 0,
    cacheWrite: 0,
    cacheRead: 0,
    source: "unknown",
    ...overrides,
  };
}

function makeTaskResult(
  overrides?: Partial<BenchmarkTaskResult> & { taskId?: string; mode?: string },
): BenchmarkTaskResult {
  return {
    taskId: overrides?.taskId ?? "T01",
    category: "repository-understanding",
    mode: (overrides?.mode as "baseline" | "codeatlas" | "codeatlas-intel") ?? "codeatlas",
    agent: "ollama",
    model: "test-model",
    tokens: makeMetrics(),
    cost: 0,
    durationMs: 5000,
    timedOut: false,
    exitCode: null,
    finalText: "test response",
    toolCallCount: 3,
    toolCalls: [],
    recordedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function makeEvaluation(overrides?: Partial<BenchmarkEvaluation>): BenchmarkEvaluation {
  return {
    score: 0,
    status: "incorrect",
    filesFound: [],
    filesExpected: ["src/foo.ts", "src/bar.ts"],
    fileRatio: 0,
    conceptsFound: [],
    conceptsExpected: ["concept-a"],
    conceptRatio: 0,
    citedFiles: [],
    ...overrides,
  };
}

describe("classifyFailure", () => {
  it("returns undefined for correct tasks (score === 2)", () => {
    const result = makeTaskResult();
    const evaluation = makeEvaluation({ score: 2, status: "correct" });
    expect(classifyFailure(result, evaluation)).toBeUndefined();
  });

  it("classifies timed-out tasks as budget_truncation", () => {
    const result = makeTaskResult({ timedOut: true, durationMs: 540_000 });
    const evaluation = makeEvaluation();
    const fc = classifyFailure(result, evaluation);
    expect(fc).toBeDefined();
    expect(fc?.category).toBe("budget_truncation");
  });

  it("classifies errored tasks as budget_truncation", () => {
    const result = makeTaskResult({ error: "provider timeout" });
    const evaluation = makeEvaluation();
    const fc = classifyFailure(result, evaluation);
    expect(fc).toBeDefined();
    expect(fc?.category).toBe("budget_truncation");
  });

  it("classifies tool_loop_underuse when toolCallCount <= 1 and score < 2", () => {
    const result = makeTaskResult({ toolCallCount: 0 });
    const evaluation = makeEvaluation({ score: 0 });
    const fc = classifyFailure(result, evaluation);
    expect(fc).toBeDefined();
    expect(fc?.category).toBe("tool_loop_underuse");
    expect(fc?.reason).toContain("0 tool call(s)");
  });

  it("classifies tool_loop_underuse when toolCallCount is 1", () => {
    const result = makeTaskResult({ toolCallCount: 1 });
    const evaluation = makeEvaluation({ score: 1 });
    const fc = classifyFailure(result, evaluation);
    expect(fc).toBeDefined();
    expect(fc?.category).toBe("tool_loop_underuse");
  });

  it("classifies budget_truncation when fileRatio < 0.5 and high token usage", () => {
    const result = makeTaskResult({
      toolCallCount: 5,
      tokens: makeMetrics({ total: 15_000, input: 12_000 }),
    });
    const evaluation = makeEvaluation({ fileRatio: 0.2 });
    const fc = classifyFailure(result, evaluation);
    expect(fc).toBeDefined();
    expect(fc?.category).toBe("budget_truncation");
  });

  it("classifies budget_truncation when tool outputs are truncated", () => {
    const result = makeTaskResult({
      toolCallCount: 3,
      toolCalls: [
        {
          name: "read_file_range",
          status: "success",
          isError: false,
          output: "content [truncated]",
        },
      ],
    });
    const evaluation = makeEvaluation({ fileRatio: 0.3 });
    const fc = classifyFailure(result, evaluation);
    expect(fc).toBeDefined();
    expect(fc?.category).toBe("budget_truncation");
    expect(fc?.reason).toContain("truncated");
  });

  it("classifies context_overload when many cited files + low conceptRatio + wrongFiles", () => {
    const result = makeTaskResult({ toolCallCount: 5 });
    const evaluation = makeEvaluation({
      fileRatio: 0.8,
      conceptRatio: 0.2,
      citedFiles: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"],
      wrongFiles: ["e.ts", "f.ts"],
    });
    const fc = classifyFailure(result, evaluation);
    expect(fc).toBeDefined();
    expect(fc?.category).toBe("context_overload");
  });

  it("classifies lexical_miss when expected files not found and no hallucinations", () => {
    const result = makeTaskResult({ toolCallCount: 3 });
    const evaluation = makeEvaluation({
      fileRatio: 0.25,
      conceptRatio: 0.3,
      filesFound: ["src/foo.ts"],
      filesExpected: ["src/foo.ts", "src/bar.ts", "src/baz.ts", "src/qux.ts"],
      citedFiles: ["src/foo.ts"],
      hallucinatedFiles: [],
    });
    const fc = classifyFailure(result, evaluation);
    expect(fc).toBeDefined();
    expect(fc?.category).toBe("lexical_miss");
    expect(fc?.reason).toContain("3/4 expected files");
  });

  it("returns insufficient_signal when no dominant pattern matches", () => {
    const result = makeTaskResult({ toolCallCount: 3 });
    const evaluation = makeEvaluation({
      score: 1,
      fileRatio: 0.5,
      conceptRatio: 0.5,
      citedFiles: ["a.ts"],
      wrongFiles: [],
      hallucinatedFiles: [],
    });
    const fc = classifyFailure(result, evaluation);
    expect(fc).toBeDefined();
    expect(fc?.category).toBe("insufficient_signal");
  });

  it("prioritizes budget_truncation over other categories", () => {
    // Timed out + low tool calls — should be budget_truncation, not tool_loop_underuse
    const result = makeTaskResult({ timedOut: true, toolCallCount: 0 });
    const evaluation = makeEvaluation();
    const fc = classifyFailure(result, evaluation);
    expect(fc).toBeDefined();
    expect(fc?.category).toBe("budget_truncation");
  });
});

describe("classifyAllFailures", () => {
  it("classifies failures across multiple tasks and modes", () => {
    const tasks = [
      makeTaskResult({ taskId: "T01", mode: "baseline", toolCallCount: 0 }),
      makeTaskResult({ taskId: "T01", mode: "codeatlas", toolCallCount: 5 }),
      makeTaskResult({ taskId: "T02", mode: "baseline", timedOut: true }),
      makeTaskResult({ taskId: "T02", mode: "codeatlas", toolCallCount: 3 }),
    ];
    const evaluations = [
      { taskId: "T01", mode: "baseline" as const, evaluation: makeEvaluation({ score: 0 }) },
      { taskId: "T01", mode: "codeatlas" as const, evaluation: makeEvaluation({ score: 2 }) },
      { taskId: "T02", mode: "baseline" as const, evaluation: makeEvaluation({ score: 0 }) },
      { taskId: "T02", mode: "codeatlas" as const, evaluation: makeEvaluation({ score: 1 }) },
    ];

    const report = classifyAllFailures(tasks, evaluations);
    expect(report.totalTasks).toBe(4);
    expect(report.totalFailures).toBe(3); // T01-baseline (tool_loop_underuse) + T02-baseline (budget_truncation) + T02-codeatlas (lexical_miss)
    expect(report.aggregate["tool_loop_underuse"]).toBe(1);
    expect(report.aggregate["budget_truncation"]).toBe(1);
    expect(report.entries).toHaveLength(3);
  });

  it("skips tasks with no matching evaluation", () => {
    const tasks = [makeTaskResult({ taskId: "T01", toolCallCount: 0 })];
    const evaluations: never[] = [];
    const report = classifyAllFailures(tasks, evaluations);
    expect(report.totalFailures).toBe(0);
  });

  it("skips correct tasks", () => {
    const tasks = [makeTaskResult({ taskId: "T01", toolCallCount: 5 })];
    const evaluations = [
      {
        taskId: "T01",
        mode: "codeatlas" as const,
        evaluation: makeEvaluation({ score: 2, status: "correct" }),
      },
    ];
    const report = classifyAllFailures(tasks, evaluations);
    expect(report.totalFailures).toBe(0);
  });
});
