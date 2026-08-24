import { describe, expect, it } from "vitest";
import { JobCancelledError, JobManager, JobQueueFullError } from "../src/jobs";

function manager(overrides: Partial<ConstructorParameters<typeof JobManager>[0]> = {}): JobManager {
  return new JobManager({ maxConcurrent: 1, maxQueued: 2, jobTimeoutMs: 5_000, ...overrides });
}

describe("JobManager", () => {
  it("runs a job to completion with stage and progress updates", async () => {
    const jobs = manager();
    const job = jobs.create(
      "benchmark",
      {
        stages: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
      async (ctx) => {
        ctx.startStage("a");
        ctx.setProgress(0, 2);
        ctx.finishStage("a", "done", "a done");
        ctx.startStage("b");
        ctx.setProgress(2, 2);
        ctx.finishStage("b", "done");
        return { answer: 42 };
      },
    );
    await jobs.idle();
    expect(job.status).toBe("completed");
    expect(job.result).toEqual({ answer: 42 });
    expect(job.stages.map((s) => s.state)).toEqual(["done", "done"]);
    expect(job.progress).toEqual({ completed: 2, total: 2 });
    expect(job.error).toBeUndefined();
  });

  it("marks a failed job with the error message", async () => {
    const jobs = manager();
    const job = jobs.create("benchmark", { stages: [{ id: "a", label: "A" }] }, async () => {
      throw new Error("runner exploded");
    });
    await jobs.idle();
    expect(job.status).toBe("failed");
    expect(job.error).toBe("runner exploded");
    // The stage never started — it is honestly reported as cancelled, not failed.
    expect(job.stages[0]?.state).toBe("cancelled");
  });

  it("cancels a queued job without running it", async () => {
    const jobs = manager();
    let blockerRan = false;
    let queuedRan = false;
    const blocker = jobs.create("benchmark", { stages: [] }, async () => {
      blockerRan = true;
    });
    const queued = jobs.create("benchmark", { stages: [{ id: "x", label: "X" }] }, async () => {
      queuedRan = true;
    });
    expect(queued.status).toBe("queued");
    expect(jobs.cancel(queued.id)).toBe(true);
    await jobs.idle();
    expect(queued.status).toBe("cancelled");
    expect(queuedRan).toBe(false);
    expect(blockerRan).toBe(true);
    expect(blocker.status).toBe("completed");
  });

  it("cancels a running job cooperatively at the next checkpoint", async () => {
    const jobs = manager();
    const job = jobs.create(
      "benchmark",
      {
        stages: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
      async (ctx) => {
        ctx.startStage("a");
        await new Promise((r) => setTimeout(r, 30));
        ctx.throwIfCancelled();
        ctx.startStage("b");
      },
    );
    await new Promise((r) => setTimeout(r, 5));
    expect(job.status).toBe("running");
    jobs.cancel(job.id);
    await jobs.idle();
    expect(job.status).toBe("cancelled");
    expect(job.stages.map((s) => s.state)).toEqual(["cancelled", "cancelled"]);
  });

  it("treats exceeding the wall-clock budget as cancellation", async () => {
    let now = 0;
    const jobs = new JobManager({ maxConcurrent: 1, jobTimeoutMs: 100, now: () => now });
    const job = jobs.create("benchmark", { stages: [] }, async (ctx) => {
      now = 200; // time passes beyond the budget
      ctx.throwIfCancelled();
    });
    await jobs.idle();
    expect(job.status).toBe("cancelled");
    expect(job.error).toContain("budget");
  });

  it("rejects job creation when the queue is full", async () => {
    const jobs = manager({ maxConcurrent: 1, maxQueued: 1 });
    jobs.create("benchmark", { stages: [] }, () => new Promise<void>(() => undefined));
    jobs.create("benchmark", { stages: [] }, () => new Promise<void>(() => undefined));
    expect(() => jobs.create("benchmark", { stages: [] }, async () => undefined)).toThrow(
      JobQueueFullError,
    );
  });

  it("surfaces cancellation through the JobCancelledError name", () => {
    const err = new JobCancelledError("cancelled");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("JobCancelledError");
  });
});
