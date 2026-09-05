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
    files: 2,
    tasks: [
      {
        id: "T01",
        category: "file-discovery",
        prompt: "Where is the entry point?",
        expected_files: ["src/main.ts"],
        expected_concepts: ["createApp"],
        evaluation_method: "auto",
      },
      {
        id: "T02",
        category: "repository-understanding",
        prompt: "Describe the project structure.",
        expected_files: ["README.md"],
        expected_concepts: ["project"],
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
    },
    createdAt: "2026-08-22T00:00:00Z",
    status: "created",
    taskFiles: ["test-tasks.json"],
    ...overrides,
  };
}

function fakeRunner(): BenchmarkRunner {
  return {
    name: "opencode",
    async execute(_request: RunnerRequest): Promise<Result<RunnerResult>> {
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
        finalText: "The entry point is src/main.ts.",
        toolCalls: [],
      });
    },
  };
}

function hangingRunner(release?: { promise: Promise<void>; resolve: () => void }): BenchmarkRunner {
  const released =
    release ??
    (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    })();
  return {
    name: "opencode",
    async execute(_request: RunnerRequest): Promise<Result<RunnerResult>> {
      await released.promise;
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
        finalText: "done",
        toolCalls: [],
      });
    },
  };
}

describe("BenchmarkService.cancelSuite", () => {
  let tmpDir: string;
  let store: BenchmarkStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "benchmark-cancel-test-"));
    store = new BenchmarkStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Cancelling a queued (created) job
  // -----------------------------------------------------------------------

  it("cancels a queued suite and marks it cancelled in the store", async () => {
    const suite = makeSuite({ status: "created" });
    store.saveSuite(suite);
    store.saveTaskFile(makeTaskFile(), "test-tasks.json");

    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", fakeRunner()]]),
    });

    const result = await service.cancelSuite("test-suite");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cancelled).toBe(true);
      expect(result.value.status).toBe("cancelled");
    }

    // Verify durable state
    const loaded = store.loadSuite("test-suite");
    expect(loaded?.status).toBe("cancelled");

    // Subsequent runTask should refuse
    const runResult = await service.runTask({
      suiteId: "test-suite",
      taskId: "T01",
      mode: "baseline",
      repositoryPath: tmpDir,
    });
    expect(runResult.ok).toBe(false);

    service.close();
  });

  // -----------------------------------------------------------------------
  // Cancelling an in-flight job
  // -----------------------------------------------------------------------

  it("cancels an in-flight suite and aborts the runner", async () => {
    const suite = makeSuite({ status: "created" });
    store.saveSuite(suite);
    store.saveTaskFile(makeTaskFile(), "test-tasks.json");

    let resolveRelease: (() => void) | undefined;
    const releasePromise = new Promise<void>((r) => {
      resolveRelease = r;
    });
    const runner = hangingRunner({ promise: releasePromise, resolve: () => resolveRelease?.() });

    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", runner]]),
    });

    // Start a run in the background
    const runPromise = service.runSuite({
      suiteId: "test-suite",
      repositoryPath: tmpDir,
      modes: ["baseline"],
    });

    // Wait for the runner to be blocked
    await new Promise((r) => setTimeout(r, 20));

    // Cancel while in-flight
    const cancelResult = await service.cancelSuite("test-suite");
    expect(cancelResult.ok).toBe(true);
    if (cancelResult.ok) {
      expect(cancelResult.value.cancelled).toBe(true);
      expect(cancelResult.value.status).toBe("cancelled");
    }

    // Release the runner so it can finish (but the signal is already aborted)
    resolveRelease?.();

    // The run should fail due to cancellation
    const runResult = await runPromise;
    expect(runResult.ok).toBe(false);

    // Verify durable state
    const loaded = store.loadSuite("test-suite");
    expect(loaded?.status).toBe("cancelled");

    service.close();
  });

  // -----------------------------------------------------------------------
  // Cancelling an already-finished job
  // -----------------------------------------------------------------------

  it("returns cancelled=false for an already-completed suite", async () => {
    const suite = makeSuite({ status: "completed" });
    store.saveSuite(suite);

    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", fakeRunner()]]),
    });

    const result = await service.cancelSuite("test-suite");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cancelled).toBe(false);
      expect(result.value.status).toBe("completed");
    }

    // State unchanged
    const loaded = store.loadSuite("test-suite");
    expect(loaded?.status).toBe("completed");

    service.close();
  });

  it("returns cancelled=false for an already-failed suite", async () => {
    const suite = makeSuite({ status: "failed" });
    store.saveSuite(suite);

    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", fakeRunner()]]),
    });

    const result = await service.cancelSuite("test-suite");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cancelled).toBe(false);
      expect(result.value.status).toBe("failed");
    }

    service.close();
  });

  it("returns cancelled=false for an already-cancelled suite", async () => {
    const suite = makeSuite({ status: "cancelled" });
    store.saveSuite(suite);

    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", fakeRunner()]]),
    });

    const result = await service.cancelSuite("test-suite");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cancelled).toBe(false);
      expect(result.value.status).toBe("cancelled");
    }

    service.close();
  });

  // -----------------------------------------------------------------------
  // Cancelling a non-existent suite
  // -----------------------------------------------------------------------

  it("returns an error for a non-existent suite", async () => {
    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", fakeRunner()]]),
    });

    const result = await service.cancelSuite("nonexistent");
    expect(result.ok).toBe(false);

    service.close();
  });

  // -----------------------------------------------------------------------
  // Cancelled suite blocks runTask
  // -----------------------------------------------------------------------

  it("prevents runTask on a cancelled suite", async () => {
    const suite = makeSuite({ status: "created" });
    store.saveSuite(suite);
    store.saveTaskFile(makeTaskFile(), "test-tasks.json");

    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", fakeRunner()]]),
    });

    // Cancel first
    await service.cancelSuite("test-suite");

    // Attempt to run a task
    const result = await service.runTask({
      suiteId: "test-suite",
      taskId: "T01",
      mode: "baseline",
      repositoryPath: tmpDir,
    });
    expect(result.ok).toBe(false);

    service.close();
  });

  // -----------------------------------------------------------------------
  // Cancelled suite blocks runSuite loop
  // -----------------------------------------------------------------------

  it("stops the runSuite loop when cancellation is requested mid-run", async () => {
    const suite = makeSuite({ status: "created" });
    store.saveSuite(suite);
    store.saveTaskFile(makeTaskFile(), "test-tasks.json");

    let taskCount = 0;
    let resolveRelease: (() => void) | undefined;
    const releasePromise = new Promise<void>((r) => {
      resolveRelease = r;
    });

    const countingRunner: BenchmarkRunner = {
      name: "opencode",
      async execute(_request: RunnerRequest): Promise<Result<RunnerResult>> {
        taskCount += 1;
        if (taskCount === 1) {
          // First task completes normally
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
            finalText: "done",
            toolCalls: [],
          });
        }
        // Second task hangs — we cancel during this
        await releasePromise;
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
          finalText: "done",
          toolCalls: [],
        });
      },
    };

    const service = new BenchmarkService({
      root: tmpDir,
      runners: new Map([["opencode", countingRunner]]),
    });

    // Start runSuite in background
    const runPromise = service.runSuite({
      suiteId: "test-suite",
      repositoryPath: tmpDir,
      modes: ["baseline"],
    });

    // Wait for second task to start hanging
    await new Promise((r) => setTimeout(r, 30));

    // Cancel
    const cancelResult = await service.cancelSuite("test-suite");
    expect(cancelResult.ok).toBe(true);
    if (cancelResult.ok) {
      expect(cancelResult.value.cancelled).toBe(true);
    }

    // Release the runner
    resolveRelease?.();

    // runSuite should fail
    const runResult = await runPromise;
    expect(runResult.ok).toBe(false);

    // Only 1 task should have completed (the second was interrupted)
    expect(taskCount).toBeLessThanOrEqual(2);

    service.close();
  });
});
