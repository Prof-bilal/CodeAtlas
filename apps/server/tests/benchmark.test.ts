import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BenchmarkStore } from "@atlas/benchmark";
import type { BenchmarkSuiteResult, BenchmarkTaskResult, TaskFile } from "@atlas/sdk";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildStats,
  buildSuiteSummary,
  computeScore,
  extractSuiteMetrics,
  readSuiteMeta,
  toTaskModeView,
  writeSuiteMeta,
} from "../src/benchmark";

const tmp = mkdtempSync(join(tmpdir(), "atlas-server-bench-"));
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function taskResult(overrides: Partial<BenchmarkTaskResult>): BenchmarkTaskResult {
  return {
    taskId: "T1",
    category: "file-discovery",
    mode: "baseline",
    agent: "opencode",
    model: "test-model",
    tokens: {
      input: 100,
      output: 20,
      reasoning: 0,
      total: 120,
      cacheWrite: 0,
      cacheRead: 0,
      source: "estimated",
    },
    cost: 0,
    durationMs: 1_000,
    timedOut: false,
    exitCode: 0,
    finalText: "src/main.ts mentions createApp",
    toolCallCount: 0,
    toolCalls: [],
    recordedAt: "2026-08-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("extractSuiteMetrics + computeScore", () => {
  it("derives savings and accuracy from measured results only", () => {
    const raw: BenchmarkSuiteResult = {
      suiteId: "s",
      tasks: [
        taskResult({
          mode: "baseline",
          tokens: {
            input: 900,
            output: 100,
            reasoning: 0,
            total: 1000,
            cacheWrite: 0,
            cacheRead: 0,
            source: "estimated",
          },
        }),
        taskResult({
          mode: "codeatlas",
          tokens: {
            input: 150,
            output: 50,
            reasoning: 0,
            total: 200,
            cacheWrite: 0,
            cacheRead: 0,
            source: "estimated",
          },
          durationMs: 500,
          toolCallCount: 3,
          toolCalls: [{ name: "search_symbols", status: "success", isError: false }],
        }),
      ],
      evaluations: [
        {
          taskId: "T1",
          mode: "baseline",
          evaluation: {
            score: 1,
            status: "partially_correct",
            filesFound: ["src/main.ts"],
            filesExpected: ["src/main.ts", "src/util.ts"],
            fileRatio: 0.5,
            conceptsFound: [],
            conceptsExpected: [],
            conceptRatio: 0,
            citedFiles: [],
          },
        },
        {
          taskId: "T1",
          mode: "codeatlas",
          evaluation: {
            score: 2,
            status: "correct",
            filesFound: ["src/main.ts", "src/util.ts"],
            filesExpected: ["src/main.ts", "src/util.ts"],
            fileRatio: 1,
            conceptsFound: [],
            conceptsExpected: [],
            conceptRatio: 0,
            citedFiles: [],
          },
        },
      ],
      tokenSavings: 800,
      costSavings: 0,
      accuracyDelta: 1,
      completedAt: "2026-08-23T01:00:00.000Z",
    };
    const metrics = extractSuiteMetrics(raw);
    expect(metrics.baselineTokens).toBe(1000);
    expect(metrics.codeatlasTokens).toBe(200);
    expect(metrics.tokenSavingsPct).toBe(80);
    expect(metrics.baselineAvgScore).toBe(1);
    expect(metrics.codeatlasAvgScore).toBe(2);
    expect(metrics.accuracyDelta).toBe(1);
    expect(metrics.toolCallsCodeatlas).toBe(3);

    const score = computeScore(metrics);
    expect(score).not.toBeNull();
    // 50 + 25*(80/50 → clamped 1) + 25*(1) = 100
    expect(score?.value).toBe(100);
    expect(score?.formula).toContain("tokenSavings");
  });

  it("returns a null score when baseline tokens were never measured", () => {
    const metrics = extractSuiteMetrics({
      suiteId: "s",
      tasks: [taskResult({ mode: "codeatlas" })],
      evaluations: [],
      tokenSavings: 0,
      costSavings: 0,
      accuracyDelta: 0,
      completedAt: "2026-08-23T01:00:00.000Z",
    });
    expect(metrics.tokenSavingsPct).toBeNull();
    expect(computeScore(metrics)).toBeNull();
  });
});

describe("suite summaries", () => {
  it("builds a summary with repository label from the task file when no sidecar exists", () => {
    const root = join(tmp, "store-a");
    const store = new BenchmarkStore(root);
    const taskFile: TaskFile = {
      repository: "fixture",
      name: "fixture-repo",
      version: "1.0.0",
      files: 2,
      tasks: [
        {
          id: "T1",
          category: "file-discovery",
          prompt: "Find the entry point",
          expected_files: ["src/main.ts"],
          expected_concepts: ["createApp"],
          evaluation_method: "auto",
        },
      ],
    };
    store.saveTaskFile(taskFile, "s1-tasks.json");
    store.saveSuite({
      id: "s1",
      name: "Fixture Benchmark",
      config: {
        id: "s1",
        name: "Fixture Benchmark",
        agent: "opencode",
        model: "m",
        modes: ["baseline", "codeatlas"],
      },
      createdAt: "2026-08-23T00:00:00.000Z",
      status: "created",
      taskFiles: ["s1-tasks.json"],
    });
    const suites = store.listSuites();
    const first = suites[0];
    expect(first).toBeDefined();
    const summary = buildSuiteSummary(root, store, first);
    expect(summary.repository.name).toBe("fixture-repo");
    expect(summary.repository.version).toBe("1.0.0");
    expect(summary.tasks.total).toBe(2); // 1 task × 2 modes
    expect(summary.tasks.completed).toBe(0);
    expect(summary.metrics).toBeNull();
    expect(summary.score).toBeNull();
    expect(summary.status).toBe("created");
  });

  it("prefers the sidecar repository metadata when present", () => {
    const root = join(tmp, "store-b");
    const store = new BenchmarkStore(root);
    store.saveSuite({
      id: "s2",
      name: "B",
      config: { id: "s2", name: "B", agent: "opencode", model: "m", modes: ["baseline"] },
      createdAt: "2026-08-23T00:00:00.000Z",
      status: "completed",
      taskFiles: [],
    });
    writeSuiteMeta(root, "s2", {
      repositoryPath: tmp,
      repositoryName: "sidecar-name",
      createdAt: "2026-08-23T00:00:00.000Z",
    });
    const meta = readSuiteMeta(root, "s2");
    expect(meta?.repositoryName).toBe("sidecar-name");
    const allSuites = store.listSuites();
    const first = allSuites[0];
    expect(first).toBeDefined();
    const summary = buildSuiteSummary(root, store, first);
    expect(summary.repository.name).toBe("sidecar-name");
  });

  it("aggregates stats over measured summaries only", () => {
    const stats = buildStats([
      {
        id: "a",
        name: "A",
        status: "completed",
        createdAt: "",
        agent: "opencode",
        model: "m",
        modes: ["baseline", "codeatlas"],
        repository: { name: "repo-a" },
        tasks: { total: 2, completed: 2 },
        lastRunAt: "2026-08-23T00:00:00.000Z",
        metrics: {
          taskCount: 2,
          baselineTokens: 1000,
          codeatlasTokens: 500,
          tokenSavings: 500,
          tokenSavingsPct: 50,
          costSavings: 0,
          baselineAvgScore: 1,
          codeatlasAvgScore: 2,
          accuracyDelta: 1,
          avgDurationMsBaseline: 1000,
          avgDurationMsCodeatlas: 500,
          toolCallsCodeatlas: 2,
          avgDurationMs: 750,
          completedAt: "2026-08-23T00:00:00.000Z",
        },
        score: { value: 100, inputs: { tokenSavingsPct: 50, accuracyDelta: 1 }, formula: "f" },
        scaffoldedTasks: false,
      },
      {
        id: "b",
        name: "B",
        status: "created",
        createdAt: "",
        agent: "opencode",
        model: "m",
        modes: [],
        repository: { name: "repo-b" },
        tasks: { total: 0, completed: 0 },
        lastRunAt: null,
        metrics: null,
        score: null,
        scaffoldedTasks: false,
      },
    ]);
    expect(stats.repositoriesTested).toBe(1);
    expect(stats.totalBenchmarks).toBe(2);
    expect(stats.avgTokenSavingsPct).toBe(50);
    expect(stats.avgScore).toBe(100);
    expect(stats.avgExecutionTimeMs).toBe(750);
  });
});

describe("toTaskModeView", () => {
  it("trims the final text to an excerpt and carries the evaluation", () => {
    const view = toTaskModeView(taskResult({ finalText: "x".repeat(5_000) }), {
      taskId: "T1",
      mode: "baseline",
      evaluation: {
        score: 2,
        status: "correct",
        filesFound: ["src/main.ts"],
        filesExpected: ["src/main.ts"],
        fileRatio: 1,
        conceptsFound: ["createApp"],
        conceptsExpected: ["createApp"],
        conceptRatio: 1,
        citedFiles: [],
      },
    });
    expect(view.finalTextExcerpt.length).toBe(2_000);
    expect(view.evaluation?.status).toBe("correct");
    expect(view.evaluation?.fileRatio).toBe(1);
  });
});
