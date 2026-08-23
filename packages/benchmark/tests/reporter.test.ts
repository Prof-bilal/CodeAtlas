import type {
  BenchmarkConfig,
  BenchmarkEvaluationEntry,
  BenchmarkStatus,
  BenchmarkTaskResult,
} from "@atlas/core";
import { describe, expect, it } from "vitest";
import { renderHtml, renderReport } from "../src/reporter";

const baseConfig: BenchmarkConfig = {
  id: "test-suite",
  name: "Test Benchmark",
  agent: "opencode",
  model: "test-model",
  modes: ["baseline", "codeatlas"],
};

const baseStatus: BenchmarkStatus = {
  suiteId: "test-suite",
  status: "completed",
  completed: 2,
  total: 2,
  updatedAt: "2026-08-22T00:00:00Z",
};

function makeTask(
  taskId: string,
  mode: "baseline" | "codeatlas",
  tokens: number,
  durationMs: number,
): BenchmarkTaskResult {
  return {
    taskId,
    category: "repository-understanding",
    mode,
    agent: "opencode",
    model: "test-model",
    tokens: {
      input: tokens,
      output: tokens,
      reasoning: 0,
      total: tokens,
      cacheWrite: 0,
      cacheRead: 0,
      source: "actual",
    },
    cost: 0,
    durationMs,
    timedOut: false,
    exitCode: 0,
    finalText: `Response for ${taskId} in ${mode} mode`,
    toolCallCount: 0,
    toolCalls: [],
    recordedAt: "2026-08-22T00:00:00Z",
  };
}

function makeEval(
  taskId: string,
  mode: "baseline" | "codeatlas",
  score: number,
): BenchmarkEvaluationEntry {
  const status = score === 2 ? "correct" : score === 1 ? "partially_correct" : "incorrect";
  return {
    taskId,
    mode,
    evaluation: {
      score,
      status,
      filesFound: [],
      filesExpected: [],
      fileRatio: score / 2,
      conceptsFound: [],
      conceptsExpected: [],
      conceptRatio: score / 2,
      citedFiles: [],
    },
  };
}

describe("renderReport", () => {
  it("generates a Markdown report with token summary", () => {
    const report = renderReport({
      suiteId: "test-suite",
      config: baseConfig,
      tasks: [makeTask("T01", "baseline", 1000, 5000), makeTask("T01", "codeatlas", 600, 3000)],
      evaluations: [makeEval("T01", "baseline", 1), makeEval("T01", "codeatlas", 2)],
      status: baseStatus,
    });

    expect(report.format).toBe("markdown");
    expect(report.content).toContain("Test Benchmark");
    expect(report.content).toContain("Token & Cost Summary");
    expect(report.content).toContain("Accuracy Summary");
    expect(report.content).toContain("Task Results");
    expect(report.content).toContain("1,000");
    expect(report.content).toContain("600");
  });

  it("handles empty tasks gracefully", () => {
    const report = renderReport({
      suiteId: "empty",
      config: { ...baseConfig, id: "empty", name: "Empty" },
      tasks: [],
      evaluations: [],
      status: { ...baseStatus, suiteId: "empty", completed: 0, total: 0 },
    });

    expect(report.content).toContain("Empty");
    expect(report.content).toContain("0/0 tasks");
  });
});

describe("renderHtml", () => {
  it("generates a standalone HTML document with the same data", () => {
    const report = renderHtml({
      suiteId: "test-suite",
      config: baseConfig,
      tasks: [makeTask("T01", "baseline", 1000, 5000), makeTask("T01", "codeatlas", 600, 3000)],
      evaluations: [makeEval("T01", "baseline", 1), makeEval("T01", "codeatlas", 2)],
      status: baseStatus,
    });

    expect(report.format).toBe("html");
    expect(report.content).toContain("<!doctype html>");
    expect(report.content).toContain("<title>Benchmark Report — Test Benchmark</title>");
    expect(report.content).toContain("Token &amp; Cost Summary");
    expect(report.content).toContain("Accuracy Summary");
    expect(report.content).toContain("Task Results");
    expect(report.content).toContain("T01");
  });

  it("escapes HTML-sensitive task content", () => {
    const task = makeTask("<script>&quot;T01&quot;</script>", "baseline", 10, 10);
    const report = renderHtml({
      suiteId: "test-suite",
      config: baseConfig,
      tasks: [task],
      evaluations: [],
      status: baseStatus,
    });

    expect(report.content).not.toContain("<script>");
    expect(report.content).toContain("&lt;script&gt;");
  });
});
