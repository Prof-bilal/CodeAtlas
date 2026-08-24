import { randomUUID } from "node:crypto";

/**
 * In-memory job manager for long-running benchmark work.
 *
 * Jobs are the API's unit of progress: a job has named stages, cooperative
 * cancellation, a wall-clock budget, and (for task-oriented benchmarks) a
 * `completed/total` counter plus the current task label. The API layer polls
 * `GET /api/jobs/:id` — there is no fake progress; a stage is only `done`
 * when the work behind it actually finished.
 *
 * Jobs live in-process (documented limitation): restarting the server drops
 * job records, but every completed task result is persisted by the benchmark
 * store, so interrupted suites resume.
 */
export type JobKind = "benchmark" | "browser";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type JobStageState = "pending" | "active" | "done" | "skipped" | "failed" | "cancelled";

export interface JobStage {
  readonly id: string;
  readonly label: string;
  state: JobStageState;
  /** Free-form detail for the active/finished stage (e.g. "18/18 tasks"). */
  detail?: string | undefined;
  startedAt?: string | undefined;
  endedAt?: string | undefined;
}

export interface JobRecord {
  readonly id: string;
  readonly kind: JobKind;
  status: JobStatus;
  readonly createdAt: string;
  startedAt?: string | undefined;
  updatedAt: string;
  endedAt?: string | undefined;
  stages: JobStage[];
  progress: { completed: number; total: number };
  currentTask?: string | undefined;
  suiteId?: string | undefined;
  repository?:
    | {
        id?: string | undefined;
        name: string;
        path?: string | undefined;
        temporary?: boolean | undefined;
      }
    | undefined;
  query?: string | undefined;
  error?: string | undefined;
  result?: unknown;
  /** Internal cancellation flag (stripped from API responses). */
  cancelRequested: boolean;
}

/** Thrown inside job bodies when cancellation (or the timeout) is requested. */
export class JobCancelledError extends Error {
  public constructor(reason: "cancelled" | "timeout") {
    super(reason === "timeout" ? "Job exceeded its wall-clock budget" : "Job cancelled");
    this.name = "JobCancelledError";
  }
}

/** Cooperative handle a job body uses to report progress. */
export interface JobContext {
  readonly job: JobRecord;
  /** Move a stage to `active` (previous stages are not auto-finalized). */
  startStage(id: string, detail?: string): void;
  /** Mark a stage `done`/`skipped`/`failed`. */
  finishStage(id: string, state: "done" | "skipped" | "failed", detail?: string): void;
  /** Update stage detail without changing its state. */
  stageDetail(id: string, detail: string): void;
  setProgress(completed: number, total: number): void;
  setCurrentTask(label: string | undefined): void;
  /** Throws {@link JobCancelledError} when cancellation/timeout was requested. */
  throwIfCancelled(): void;
}

export class JobQueueFullError extends Error {
  public constructor(max: number) {
    super(`Job queue is full (${max} waiting). Retry when a running job finishes.`);
    this.name = "JobQueueFullError";
  }
}

export interface JobManagerOptions {
  readonly maxConcurrent?: number;
  readonly maxQueued?: number;
  readonly jobTimeoutMs?: number;
  readonly now?: () => number;
}

interface QueuedJob {
  readonly id: string;
  readonly body: (ctx: JobContext) => Promise<unknown>;
}

export class JobManager {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly queue: QueuedJob[] = [];
  private readonly running = new Set<string>();
  private readonly maxConcurrent: number;
  private readonly maxQueued: number;
  private readonly jobTimeoutMs: number;
  private readonly now: () => number;

  public constructor(options: JobManagerOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 1;
    this.maxQueued = options.maxQueued ?? 8;
    this.jobTimeoutMs = options.jobTimeoutMs ?? 60 * 60 * 1000;
    this.now = options.now ?? (() => Date.now());
  }

  /** Create a job record and schedule `body` (enqueue → run when a slot frees). */
  public create(
    kind: JobKind,
    init: {
      suiteId?: string | undefined;
      repository?: JobRecord["repository"];
      query?: string;
      stages: readonly { id: string; label: string }[];
    },
    body: (ctx: JobContext) => Promise<unknown>,
  ): JobRecord {
    const pending = this.queue.length + this.running.size;
    if (pending >= this.maxQueued + this.maxConcurrent) {
      throw new JobQueueFullError(this.maxQueued);
    }

    const nowIso = new Date(this.now()).toISOString();
    const job: JobRecord = {
      id: randomUUID(),
      kind,
      status: "queued",
      createdAt: nowIso,
      updatedAt: nowIso,
      stages: init.stages.map((s) => ({ ...s, state: "pending" })),
      progress: { completed: 0, total: 0 },
      suiteId: init.suiteId,
      repository: init.repository,
      query: init.query,
      cancelRequested: false,
    };
    this.jobs.set(job.id, job);
    this.queue.push({ id: job.id, body });
    this.pump();
    return job;
  }

  public get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  public list(): JobRecord[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Find the active/queued job for a suite, if any. */
  public findBySuite(suiteId: string): JobRecord | undefined {
    return this.list().find(
      (j) => j.suiteId === suiteId && (j.status === "queued" || j.status === "running"),
    );
  }

  /** Request cooperative cancellation. Returns false when the job already ended. */
  public cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (job === undefined) return false;
    if (job.status !== "queued" && job.status !== "running") return false;
    job.cancelRequested = true;
    job.updatedAt = new Date(this.now()).toISOString();
    if (job.status === "queued") {
      job.status = "cancelled";
      job.endedAt = job.updatedAt;
      for (const stage of job.stages) {
        if (stage.state === "pending") stage.state = "cancelled";
      }
      const idx = this.queue.findIndex((q) => q.id === id);
      if (idx >= 0) this.queue.splice(idx, 1);
    }
    return true;
  }

  /** Test seam: wait until no jobs are running or queued. */
  public async idle(): Promise<void> {
    while (this.running.size > 0 || this.queue.length > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private pump(): void {
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next === undefined) break;
      const job = this.jobs.get(next.id);
      if (job === undefined || job.status === "cancelled") continue;
      this.running.add(next.id);
      void this.execute(job, next.body);
    }
  }

  private async execute(
    job: JobRecord,
    body: (ctx: JobContext) => Promise<unknown>,
  ): Promise<void> {
    const startedAtMs = this.now();
    job.status = "running";
    job.startedAt = new Date(startedAtMs).toISOString();
    job.updatedAt = job.startedAt;

    const timedOut = (): boolean => this.now() - startedAtMs > this.jobTimeoutMs;

    const ctx: JobContext = {
      job,
      startStage: (id, detail) => {
        const stage = job.stages.find((s) => s.id === id);
        if (stage === undefined) return;
        stage.state = "active";
        stage.detail = detail;
        stage.startedAt = new Date(this.now()).toISOString();
        job.updatedAt = stage.startedAt;
      },
      finishStage: (id, state, detail) => {
        const stage = job.stages.find((s) => s.id === id);
        if (stage === undefined) return;
        stage.state = state;
        if (detail !== undefined) stage.detail = detail;
        stage.endedAt = new Date(this.now()).toISOString();
        job.updatedAt = stage.endedAt;
      },
      stageDetail: (id, detail) => {
        const stage = job.stages.find((s) => s.id === id);
        if (stage === undefined) return;
        stage.detail = detail;
        job.updatedAt = new Date(this.now()).toISOString();
      },
      setProgress: (completed, total) => {
        job.progress = { completed, total };
        job.updatedAt = new Date(this.now()).toISOString();
      },
      setCurrentTask: (label) => {
        job.currentTask = label;
        job.updatedAt = new Date(this.now()).toISOString();
      },
      throwIfCancelled: () => {
        if (job.cancelRequested) throw new JobCancelledError("cancelled");
        if (timedOut()) throw new JobCancelledError("timeout");
      },
    };

    try {
      const result = await body(ctx);
      job.result = result;
      job.status = "completed";
      for (const stage of job.stages) {
        if (stage.state === "pending" || stage.state === "active") stage.state = "skipped";
      }
    } catch (err) {
      if (err instanceof JobCancelledError) {
        job.status = "cancelled";
        job.error = err.message;
        for (const stage of job.stages) {
          if (stage.state === "pending" || stage.state === "active") stage.state = "cancelled";
        }
      } else {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : String(err);
        for (const stage of job.stages) {
          if (stage.state === "active") stage.state = "failed";
          else if (stage.state === "pending") stage.state = "cancelled";
        }
      }
    } finally {
      job.currentTask = undefined;
      job.endedAt = new Date(this.now()).toISOString();
      job.updatedAt = job.endedAt;
      this.running.delete(job.id);
      this.pump();
    }
  }
}

/** Strip the internal cancellation flag for API responses. */
export function publicJob(job: JobRecord): Record<string, unknown> {
  const { cancelRequested: _drop, ...rest } = job;
  return rest;
}
