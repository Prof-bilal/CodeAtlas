import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BenchmarkRunner,
  BenchmarkSuite,
  RunnerRequest,
  RunnerResult,
  TaskFile,
} from "@atlas/core";
import { type Result, ok } from "@atlas/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BenchmarkService } from "../src/benchmark.service";
import { BenchmarkStore } from "../src/store";

function makeTaskFile(): TaskFile {
  return {
    repository: "test-repo",
    name: "test-repo",
    version: "1.0.0",
    files: 1,
    tasks: [
      {
        id: "T01",
        category: "file-discovery",
        prompt: "Where is the entry point?",
        expected_files: ["src/main.ts"],
        expected_concepts: ["createApp"],
        evaluation_method: "auto",
      },
    ],
  };
}

function makeSuite(overrides?: Partial<BenchmarkSuite>): BenchmarkSuite {
  return {
    id: "test-suite",
    name: "Test Suite",
    config: {
      id: "test-suite",
      name: "Test Suite",
      agent: "opencode",
      model: "test-model",
      modes: ["baseline"],
      runsPerTask: 3,
    },
    createdAt: "2026-09-07T00:00:00Z",
    status: "created",
    taskFiles: ["test-tasks.json"],
    ...overrides,
  };
}

function counterRunner(counter: { calls: number }): BenchmarkRunner {
  return {
    name: "opencode",
    async execute(_request: RunnerRequest): Promise<Result<RunnerResult>> {
      counter.calls++;
      return ok({
        metrics: {
          input: 100,
          output: 50,
          reasoning: 0,
          total: 150,
          cacheWrite: 0,
          cacheRead: 0,
          source: "actual",
        },
        cost: 0,
        durationMs: 100,
        timedOut: false,
        exitCode: 0,
        finalText: `run ${counter.calls}`,
        toolCalls: [],
      });
    },
  };
}

describe("BenchmarkService multi-run persistence (single-model)", () => {
  let tmpDir: string;
  let store: BenchmarkStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "benchmark-multirun-test-"));
    store = new BenchmarkStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves each run under a distinct TASK#runN key so they do not overwrite each other", async () => {
    const suite = makeSuite({ status: "created" });
    store.saveSuite(suite);
    store.saveTaskFile(makeTaskFile(), "test-tasks.json");

    const counter = { calls: 0 };
    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", counterRunner(counter)]]),
    });

    const result = await service.runSuite({
      suiteId: "test-suite",
      repositoryPath: tmpDir,
      modes: ["baseline"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(counter.calls).toBe(3);
    expect(result.value.tasks).toHaveLength(3);

    // Every run persisted under its own TASK#runN key
    for (let n = 1; n <= 3; n++) {
      const stored = store.loadTaskResult("test-suite", `T01#run${n}`, "baseline");
      expect(stored).not.toBeNull();
      expect(stored?.finalText).toBe(`run ${n}`);
    }

    service.close();
  });

  it("keeps every run distinct — later runs never clobber earlier run keys", async () => {
    const suite = makeSuite({ status: "created" });
    store.saveSuite(suite);
    store.saveTaskFile(makeTaskFile(), "test-tasks.json");

    const counter = { calls: 0 };
    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", counterRunner(counter)]]),
    });

    const result = await service.runSuite({
      suiteId: "test-suite",
      repositoryPath: tmpDir,
      modes: ["baseline"],
    });

    expect(result.ok).toBe(true);
    for (let n = 1; n <= 3; n++) {
      const stored = store.loadTaskResult("test-suite", `T01#run${n}`, "baseline");
      expect(stored?.finalText).toBe(`run ${n}`);
    }

    service.close();
  });

  it("resumes correctly: re-running without force skips existing run keys", async () => {
    const suite = makeSuite({ status: "created" });
    store.saveSuite(suite);
    store.saveTaskFile(makeTaskFile(), "test-tasks.json");

    const counter = { calls: 0 };
    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", counterRunner(counter)]]),
    });

    // First run executes all 3
    await service.runSuite({ suiteId: "test-suite", repositoryPath: tmpDir, modes: ["baseline"] });
    expect(counter.calls).toBe(3);

    // Second run without force: all run keys exist -> no new calls
    const second = await service.runSuite({
      suiteId: "test-suite",
      repositoryPath: tmpDir,
      modes: ["baseline"],
    });
    expect(second.ok).toBe(true);
    expect(counter.calls).toBe(3);
    if (second.ok) expect(second.value.tasks).toHaveLength(3);

    service.close();
  });
});
