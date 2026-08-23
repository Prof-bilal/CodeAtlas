import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BenchmarkSuite, BenchmarkTaskResult, TaskFile } from "@atlas/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BenchmarkStore } from "../src/store";

describe("BenchmarkStore", () => {
  let tmpDir: string;
  let store: BenchmarkStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "benchmark-test-"));
    store = new BenchmarkStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Suites
  // -----------------------------------------------------------------------

  it("saves and loads a suite", () => {
    const suite: BenchmarkSuite = {
      id: "test-1",
      name: "Test Suite",
      config: {
        id: "test-1",
        name: "Test Suite",
        agent: "opencode",
        model: "test-model",
        modes: ["baseline", "codeatlas"],
      },
      createdAt: "2026-08-22T00:00:00Z",
      status: "created",
      taskFiles: [],
    };

    store.saveSuite(suite);
    const loaded = store.loadSuite("test-1");

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe("test-1");
    expect(loaded?.name).toBe("Test Suite");
  });

  it("returns null for non-existent suite", () => {
    expect(store.loadSuite("nonexistent")).toBeNull();
  });

  it("lists suites sorted by creation time", () => {
    const suite1: BenchmarkSuite = {
      id: "a",
      name: "A",
      config: { id: "a", name: "A", agent: "opencode", model: "m", modes: ["baseline"] },
      createdAt: "2026-08-22T01:00:00Z",
      status: "created",
      taskFiles: [],
    };
    const suite2: BenchmarkSuite = {
      id: "b",
      name: "B",
      config: { id: "b", name: "B", agent: "opencode", model: "m", modes: ["baseline"] },
      createdAt: "2026-08-22T00:00:00Z",
      status: "created",
      taskFiles: [],
    };

    store.saveSuite(suite2);
    store.saveSuite(suite1);

    const suites = store.listSuites();
    expect(suites.length).toBe(2);
    expect(suites[0]?.id).toBe("b");
    expect(suites[1]?.id).toBe("a");
  });

  it("updates suite status", () => {
    const suite: BenchmarkSuite = {
      id: "test-1",
      name: "Test",
      config: { id: "test-1", name: "Test", agent: "opencode", model: "m", modes: ["baseline"] },
      createdAt: "2026-08-22T00:00:00Z",
      status: "created",
      taskFiles: [],
    };

    store.saveSuite(suite);
    store.updateSuiteStatus("test-1", "running");

    const loaded = store.loadSuite("test-1");
    expect(loaded?.status).toBe("running");
  });

  // -----------------------------------------------------------------------
  // Task results
  // -----------------------------------------------------------------------

  it("saves and loads task results", () => {
    const result: BenchmarkTaskResult = {
      taskId: "T01",
      category: "repository-understanding",
      mode: "baseline",
      agent: "opencode",
      model: "test",
      tokens: {
        input: 100,
        output: 50,
        reasoning: 0,
        total: 150,
        cacheWrite: 0,
        cacheRead: 0,
        source: "actual",
      },
      cost: 0,
      durationMs: 1000,
      timedOut: false,
      exitCode: 0,
      finalText: "answer",
      toolCallCount: 0,
      toolCalls: [],
      recordedAt: "2026-08-22T00:00:00Z",
    };

    store.saveTaskResult("test-suite", result);
    const loaded = store.loadTaskResult("test-suite", "T01", "baseline");

    expect(loaded).not.toBeNull();
    expect(loaded?.taskId).toBe("T01");
    expect(loaded?.mode).toBe("baseline");
  });

  it("lists task results for a suite", () => {
    const result1: BenchmarkTaskResult = {
      taskId: "T01",
      category: "testing",
      mode: "baseline",
      agent: "opencode",
      model: "test",
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        total: 0,
        cacheWrite: 0,
        cacheRead: 0,
        source: "unknown",
      },
      cost: 0,
      durationMs: 100,
      timedOut: false,
      exitCode: 0,
      finalText: "",
      toolCallCount: 0,
      toolCalls: [],
      recordedAt: "2026-08-22T00:00:00Z",
    };
    const result2 = { ...result1, taskId: "T02", mode: "codeatlas" as const };

    store.saveTaskResult("test-suite", result1);
    store.saveTaskResult("test-suite", result2);

    const results = store.listTaskResults("test-suite");
    expect(results.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // Task files
  // -----------------------------------------------------------------------

  it("saves and loads task files", () => {
    const taskFile: TaskFile = {
      repository: "repo-01",
      name: "test-repo",
      version: "1.0.0",
      files: 10,
      tasks: [
        {
          id: "T01",
          category: "testing",
          prompt: "test prompt",
          expected_files: ["a.ts"],
          expected_concepts: ["concept"],
          evaluation_method: "manual",
        },
      ],
    };

    store.saveTaskFile(taskFile, "test-tasks.json");
    const loaded = store.loadTaskFile("test-tasks.json");

    expect(loaded).not.toBeNull();
    expect(loaded?.tasks.length).toBe(1);
    expect(loaded?.tasks[0]?.id).toBe("T01");
  });
});
