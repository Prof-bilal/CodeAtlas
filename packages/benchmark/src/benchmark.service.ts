import type {
  BenchmarkCancelResult,
  BenchmarkConfig,
  BenchmarkEvaluationEntry,
  BenchmarkPort,
  BenchmarkReport,
  BenchmarkRetrievalReport,
  BenchmarkRunRequest,
  BenchmarkRunner,
  BenchmarkStatus,
  BenchmarkSuite,
  BenchmarkSuiteResult,
  BenchmarkSuiteRunRequest,
  BenchmarkTaskResult,
  TaskDefinition,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { evaluateTask } from "./evaluator";
import { classifyFailure } from "./failure-classifier";
import { BenchmarkMetrics } from "./metrics";
import { renderHtml, renderReport } from "./reporter";
import type { RetrievalReport } from "./retrieval-metrics";
import { BenchmarkStore } from "./store";

/** Options for creating a BenchmarkService. */
export interface BenchmarkServiceOptions {
  /** Root directory for benchmark data (default: `.codeatlas/benchmarks`). */
  readonly root?: string | undefined;
  /** Runners available for task execution. */
  readonly runners?: ReadonlyMap<string, BenchmarkRunner> | undefined;
  /** Metrics integration (optional). */
  readonly metrics?: BenchmarkMetrics | undefined;
  /**
   * Optional retrieval-quality evaluator. When provided, `runSuite` will
   * compute recall@k / precision@k / MRR for all CodeAtlas-mode tasks and
   * attach the report to `BenchmarkSuiteResult.retrieval`.
   */
  readonly retrievalEvaluator?:
    | ((
        suite: BenchmarkSuite,
        tasks: TaskDefinition[],
        repositoryPath: string,
      ) => RetrievalReport | null)
    | undefined;
}

/**
 * Benchmark service — implements BenchmarkPort.
 *
 * Orchestrates suite creation, task execution, evaluation, and reporting.
 * Runners are injected (opencode or ollama). Persistence is JSON-backed.
 */
export class BenchmarkService implements BenchmarkPort {
  private readonly store: BenchmarkStore;
  private readonly runners: ReadonlyMap<string, BenchmarkRunner>;
  private readonly metrics: BenchmarkMetrics;
  private readonly retrievalEvaluator:
    | ((
        suite: BenchmarkSuite,
        tasks: TaskDefinition[],
        repositoryPath: string,
      ) => RetrievalReport | null)
    | undefined;
  /** Abort controllers keyed by suite id for in-flight runSuite/runTask calls. */
  private readonly activeControllers = new Map<string, AbortController>();

  public constructor(options: BenchmarkServiceOptions = {}) {
    this.store = new BenchmarkStore(options.root ?? ".codeatlas/benchmarks");
    this.runners = options.runners ?? new Map();
    this.metrics = options.metrics ?? new BenchmarkMetrics();
    this.retrievalEvaluator = options.retrievalEvaluator;
  }

  // -----------------------------------------------------------------------
  // Suite management
  // -----------------------------------------------------------------------

  public async initSuite(config: BenchmarkConfig): Promise<Result<BenchmarkSuite>> {
    const existing = this.store.loadSuite(config.id);
    if (existing !== null) {
      return fail(new Error(`Suite "${config.id}" already exists`));
    }

    const suite: BenchmarkSuite = {
      id: config.id,
      name: config.name,
      config,
      createdAt: new Date().toISOString(),
      status: "created",
      taskFiles: [],
    };

    this.store.saveSuite(suite);
    return ok(suite);
  }

  public async loadSuite(suiteId: string): Promise<Result<BenchmarkSuite>> {
    const suite = this.store.loadSuite(suiteId);
    if (suite === null) {
      return fail(new Error(`Suite "${suiteId}" not found`));
    }
    return ok(suite);
  }

  public async listSuites(): Promise<Result<BenchmarkSuite[]>> {
    return ok(this.store.listSuites());
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  public async runTask(request: BenchmarkRunRequest): Promise<Result<BenchmarkTaskResult>> {
    const suite = this.store.loadSuite(request.suiteId);
    if (suite === null) {
      return fail(new Error(`Suite "${request.suiteId}" not found`));
    }

    if (suite.status === "cancelled") {
      return fail(new Error(`Suite "${request.suiteId}" has been cancelled`));
    }

    const task = this.findTask(suite, request.taskId);
    if (task === null) {
      return fail(new Error(`Task "${request.taskId}" not found in suite`));
    }

    const runner = this.runners.get(suite.config.agent);
    if (runner === undefined) {
      return fail(new Error(`No runner for agent "${suite.config.agent}"`));
    }

    // Check cancellation before transitioning to running
    const signal = this.getOrCreateController(request.suiteId).signal;
    if (signal.aborted) {
      this.store.updateSuiteStatus(request.suiteId, "cancelled");
      return fail(new Error(`Suite "${request.suiteId}" has been cancelled`));
    }

    this.store.updateSuiteStatus(request.suiteId, "running");

    const timeoutMs = request.timeoutMs ?? suite.config.taskTimeoutMs ?? 540_000;
    const effectiveModel = request.model ?? suite.config.model;

    const runnerResult = await runner.execute({
      prompt: task.prompt,
      repositoryPath: request.repositoryPath,
      mode: request.mode,
      timeoutMs,
      model: effectiveModel,
      signal,
    });

    // Check if cancelled during execution
    if (signal.aborted) {
      this.store.updateSuiteStatus(request.suiteId, "cancelled");
      return fail(new Error(`Suite "${request.suiteId}" has been cancelled`));
    }

    if (!runnerResult.ok) {
      this.store.updateSuiteStatus(request.suiteId, "failed");
      return fail(runnerResult.error);
    }

    const rr = runnerResult.value;

    // Evaluate
    const toolOutputs = rr.toolCalls
      .map((tc) => (tc as unknown as { output?: string }).output ?? "")
      .filter((o: unknown): o is string => typeof o === "string");
    const evaluation = evaluateTask(task, rr.finalText, toolOutputs, request.repositoryPath, {
      timedOut: rr.timedOut,
    });

    // Classify failure (Phase A2)
    const failureClassification = classifyFailure(
      {
        taskId: task.id,
        category: task.category,
        mode: request.mode,
        agent: suite.config.agent,
        model: effectiveModel,
        tokens: rr.metrics,
        cost: rr.cost,
        durationMs: rr.durationMs,
        timedOut: rr.timedOut,
        exitCode: rr.exitCode,
        finalText: rr.finalText,
        toolCallCount: rr.toolCalls.length,
        toolCalls: rr.toolCalls,
        recordedAt: new Date().toISOString(),
      },
      evaluation,
    );

    const result: BenchmarkTaskResult = {
      taskId: task.id,
      category: task.category,
      mode: request.mode,
      agent: suite.config.agent,
      model: effectiveModel,
      tokens: rr.metrics,
      cost: rr.cost,
      durationMs: rr.durationMs,
      timedOut: rr.timedOut,
      exitCode: rr.exitCode,
      finalText: rr.finalText,
      toolCallCount: rr.toolCalls.length,
      toolCalls: rr.toolCalls,
      evaluation,
      ...(rr.observability !== undefined ? { observability: rr.observability } : {}),
      ...(failureClassification !== undefined ? { failureClassification } : {}),
      ...(rr.stopReason !== undefined ? { stopReason: rr.stopReason } : {}),
      ...(rr.roundCount !== undefined ? { roundCount: rr.roundCount } : {}),
      ...(rr.dedupeHitCount !== undefined ? { dedupeHitCount: rr.dedupeHitCount } : {}),
      error: rr.error,
      stderr: rr.stderr,
      recordedAt: new Date().toISOString(),
    };

    this.store.saveTaskResult(request.suiteId, result);

    // Record metrics
    this.metrics.recordTaskRun({
      suiteId: request.suiteId,
      taskId: task.id,
      mode: request.mode,
      agent: suite.config.agent,
      model: effectiveModel,
      tokens: rr.metrics.total,
      cost: rr.cost,
      durationMs: rr.durationMs,
      accuracy: evaluation.score,
    });

    return ok(result);
  }

  public async runSuite(request: BenchmarkSuiteRunRequest): Promise<Result<BenchmarkSuiteResult>> {
    const suite = this.store.loadSuite(request.suiteId);
    if (suite === null) {
      return fail(new Error(`Suite "${request.suiteId}" not found`));
    }

    const taskDefs = this.loadAllTaskDefs(suite);
    if (taskDefs.length === 0) {
      return fail(new Error("No tasks found in suite task files"));
    }

    const modes = request.modes ?? [...suite.config.modes];
    const taskFilter = request.taskId !== undefined ? request.taskId : null;
    // Matrix expansion: when multiple models are configured, run each
    // task × mode × model combination. The store key uses a sanitized
    // model suffix on the task ID to avoid collisions.
    const models = request.models ?? suite.config.models;
    const matrixModels = models !== undefined && models.length > 1 ? [...models] : undefined;

    // runsPerTask: how many times to run each task×mode×model cell (default: 1)
    const runsPerTask = suite.config.runsPerTask ?? 1;

    const signal = this.getOrCreateController(request.suiteId).signal;
    if (signal.aborted) {
      this.store.updateSuiteStatus(request.suiteId, "cancelled");
      return fail(new Error(`Suite "${request.suiteId}" has been cancelled`));
    }

    this.store.updateSuiteStatus(request.suiteId, "running");

    const results: BenchmarkTaskResult[] = [];
    const evaluations: BenchmarkEvaluationEntry[] = [];

    for (const taskDef of taskDefs) {
      if (signal.aborted) {
        this.store.updateSuiteStatus(request.suiteId, "cancelled");
        break;
      }
      if (taskFilter !== null && taskDef.id !== taskFilter) continue;

      if (matrixModels !== undefined) {
        // Matrix mode: expand task × mode × model × run
        for (const mode of modes) {
          if (signal.aborted) break;
          for (const model of matrixModels) {
            if (signal.aborted) break;
            const matrixTaskId = `${taskDef.id}@${sanitizeModelForId(model)}`;
            for (let run = 1; run <= runsPerTask; run++) {
              if (signal.aborted) break;
              const runTaskId = runsPerTask > 1 ? `${matrixTaskId}#run${run}` : matrixTaskId;
              // Skip if result exists and --force not set
              if (!request.force) {
                const existing = this.store.loadTaskResult(request.suiteId, runTaskId, mode);
                if (existing !== null) {
                  results.push(existing);
                  const ev = this.buildEvaluationEntry(existing, taskDef);
                  if (ev !== null) evaluations.push(ev);
                  continue;
                }
              }

              const taskResult = await this.runTask({
                suiteId: request.suiteId,
                taskId: taskDef.id,
                mode,
                repositoryPath: request.repositoryPath,
                model,
              });

              if (taskResult.ok) {
                // Tag result with run-specific task ID for store persistence
                const taggedResult = { ...taskResult.value, taskId: runTaskId };
                this.store.saveTaskResult(request.suiteId, taggedResult);
                results.push(taggedResult);
                const ev = this.buildEvaluationEntry(taggedResult, taskDef);
                if (ev !== null) evaluations.push(ev);
              }
            }
          }
        }
      } else {
        // Single-model mode: expand task × mode × run
        for (const mode of modes) {
          if (signal.aborted) break;
          for (let run = 1; run <= runsPerTask; run++) {
            if (signal.aborted) break;
            const runTaskId = runsPerTask > 1 ? `${taskDef.id}#run${run}` : taskDef.id;
            // Skip if result exists and --force not set
            if (!request.force) {
              const existing = this.store.loadTaskResult(request.suiteId, runTaskId, mode);
              if (existing !== null) {
                results.push(existing);
                const ev = this.buildEvaluationEntry(existing, taskDef);
                if (ev !== null) evaluations.push(ev);
                continue;
              }
            }

            const taskResult = await this.runTask({
              suiteId: request.suiteId,
              taskId: taskDef.id,
              mode,
              repositoryPath: request.repositoryPath,
              model: suite.config.model,
            });

            if (taskResult.ok) {
              results.push(taskResult.value);
              const ev = this.buildEvaluationEntry(taskResult.value, taskDef);
              if (ev !== null) evaluations.push(ev);
            }
          }
        }
      }
    }

    // If cancelled mid-run, do not overwrite the status set by the abort handler
    if (signal.aborted) {
      return fail(new Error(`Suite "${request.suiteId}" has been cancelled`));
    }

    // Compute aggregates (supports 2-arm and 3-arm)
    const baseline = results.filter((t) => t.mode === "baseline");
    const codeatlas = results.filter((t) => t.mode === "codeatlas");
    const intel = results.filter((t) => t.mode === "codeatlas-intel");
    const baseTokens = baseline.reduce((s, t) => s + t.tokens.total, 0);
    const catTokens = codeatlas.reduce((s, t) => s + t.tokens.total, 0);
    const intelTokens = intel.reduce((s, t) => s + t.tokens.total, 0);
    const baseCost = baseline.reduce((s, t) => s + t.cost, 0);
    const catCost = codeatlas.reduce((s, t) => s + t.cost, 0);
    const intelCost = intel.reduce((s, t) => s + t.cost, 0);

    const baseEvals = evaluations.filter((e) => e.mode === "baseline");
    const catEvals = evaluations.filter((e) => e.mode === "codeatlas");
    const intelEvals = evaluations.filter((e) => e.mode === "codeatlas-intel");
    const baseAvg = avg(baseEvals.map((e) => e.evaluation.score));
    const catAvg = avg(catEvals.map((e) => e.evaluation.score));
    const intelAvg = avg(intelEvals.map((e) => e.evaluation.score));

    // Accuracy delta: compare best CodeAtlas mode against baseline
    const bestCat = codeatlas.length > 0 ? catAvg : intelAvg;
    const bestTokens = codeatlas.length > 0 ? catTokens : intelTokens;
    const bestCost = codeatlas.length > 0 ? catCost : intelCost;

    this.store.updateSuiteStatus(request.suiteId, "completed");

    // Compute retrieval metrics when an evaluator is wired in (L8 / Phase B).
    let retrieval: BenchmarkRetrievalReport | undefined;
    if (this.retrievalEvaluator !== undefined) {
      const suite = this.store.loadSuite(request.suiteId);
      if (suite !== null) {
        const taskDefs = this.loadAllTaskDefs(suite);
        const retrievalReport = this.retrievalEvaluator(suite, taskDefs, request.repositoryPath);
        if (retrievalReport !== null) {
          retrieval = {
            tasks: retrievalReport.tasks.map((t) => ({
              taskId: t.taskId,
              category: t.category,
              hitsAtK: t.hitsAtK,
              relevant: t.relevant,
              retrievedPaths: t.retrievedPaths,
              ranks: t.ranks,
            })),
            precisionAtK: retrievalReport.precisionAtK,
            recallAtK: retrievalReport.recallAtK,
            meanReciprocalRank: retrievalReport.meanReciprocalRank,
          };
        }
      }
    }

    const suiteResult: BenchmarkSuiteResult = {
      suiteId: request.suiteId,
      tasks: results,
      evaluations,
      tokenSavings: baseTokens - bestTokens,
      costSavings: baseCost - bestCost,
      accuracyDelta: bestCat - baseAvg,
      completedAt: new Date().toISOString(),
      ...(retrieval !== undefined ? { retrieval } : {}),
    };

    this.store.saveRawResults(request.suiteId, suiteResult);

    return ok(suiteResult);
  }

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  public async getStatus(suiteId: string): Promise<Result<BenchmarkStatus>> {
    const suite = this.store.loadSuite(suiteId);
    if (suite === null) {
      return fail(new Error(`Suite "${suiteId}" not found`));
    }

    const taskDefs = this.loadAllTaskDefs(suite);
    const modelCount = suite.config.models?.length ?? 1;
    const runsPerTask = suite.config.runsPerTask ?? 1;
    const total = taskDefs.length * suite.config.modes.length * modelCount * runsPerTask;
    const results = this.store.listTaskResults(suiteId);

    return ok({
      suiteId,
      status: suite.status,
      completed: results.length,
      total,
      updatedAt: new Date().toISOString(),
    });
  }

  // -----------------------------------------------------------------------
  // Reporting
  // -----------------------------------------------------------------------

  public async generateReport(
    suiteId: string,
    options?: { readonly format?: "markdown" | "json" | "html" },
  ): Promise<Result<BenchmarkReport>> {
    const suite = this.store.loadSuite(suiteId);
    if (suite === null) {
      return fail(new Error(`Suite "${suiteId}" not found`));
    }

    const tasks = this.store.listTaskResults(suiteId);
    const statusResult = await this.getStatus(suiteId);
    const status = statusResult.ok
      ? statusResult.value
      : { suiteId, status: "failed" as const, completed: 0, total: 0, updatedAt: "" };

    // Build evaluation entries
    const evaluations: BenchmarkEvaluationEntry[] = [];
    for (const t of tasks) {
      const taskDef = this.findTask(suite, t.taskId);
      if (taskDef === null) continue;
      const ev = this.buildEvaluationEntry(t, taskDef);
      if (ev !== null) evaluations.push(ev);
    }

    const format = options?.format ?? "markdown";

    if (format === "json") {
      const report: BenchmarkReport = {
        suiteId,
        content: JSON.stringify({ tasks, evaluations, status }, null, 2),
        format: "json",
        generatedAt: new Date().toISOString(),
      };
      this.store.saveReport(report);
      return ok(report);
    }

    if (format === "html") {
      const report = renderHtml({
        suiteId,
        config: suite.config,
        tasks,
        evaluations,
        status,
      });
      this.store.saveReport(report);
      return ok(report);
    }

    const report = renderReport({
      suiteId,
      config: suite.config,
      tasks,
      evaluations,
      status,
    });

    this.store.saveReport(report);
    return ok(report);
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  public close(): void {
    // Abort any active runs and clean up controllers
    for (const [id, controller] of this.activeControllers) {
      controller.abort();
      this.activeControllers.delete(id);
    }
  }

  // -----------------------------------------------------------------------
  // Cancellation
  // -----------------------------------------------------------------------

  public async cancelSuite(suiteId: string): Promise<Result<BenchmarkCancelResult>> {
    const suite = this.store.loadSuite(suiteId);
    if (suite === null) {
      return fail(new Error(`Suite "${suiteId}" not found`));
    }

    const terminal =
      suite.status === "completed" || suite.status === "failed" || suite.status === "cancelled";
    if (terminal) {
      return ok({
        suiteId,
        status: suite.status,
        cancelled: false,
      });
    }

    // Abort any in-flight runner process via the signal
    const controller = this.activeControllers.get(suiteId);
    if (controller !== undefined) {
      controller.abort();
      this.activeControllers.delete(suiteId);
    }

    // Durably mark cancelled in the store
    this.store.updateSuiteStatus(suiteId, "cancelled");

    return ok({
      suiteId,
      status: "cancelled",
      cancelled: true,
    });
  }

  private getOrCreateController(suiteId: string): AbortController {
    let controller = this.activeControllers.get(suiteId);
    if (controller === undefined || controller.signal.aborted) {
      controller = new AbortController();
      this.activeControllers.set(suiteId, controller);
    }
    return controller;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private findTask(suite: BenchmarkSuite, taskId: string): TaskDefinition | null {
    for (const tf of suite.taskFiles) {
      const taskFile = this.store.loadTaskFile(tf);
      if (taskFile === null) continue;
      const found = taskFile.tasks.find((t) => t.id === taskId);
      if (found !== undefined) return found;
    }
    return null;
  }

  private loadAllTaskDefs(suite: BenchmarkSuite): TaskDefinition[] {
    const all: TaskDefinition[] = [];
    for (const tf of suite.taskFiles) {
      const taskFile = this.store.loadTaskFile(tf);
      if (taskFile !== null) all.push(...taskFile.tasks);
    }
    return all;
  }

  private buildEvaluationEntry(
    result: BenchmarkTaskResult,
    taskDef: TaskDefinition,
  ): BenchmarkEvaluationEntry | null {
    const toolOutputs = result.toolCalls
      .map((tc) => (tc as unknown as { output?: string }).output ?? "")
      .filter((o: unknown): o is string => typeof o === "string");

    const evaluation = evaluateTask(taskDef, result.finalText, toolOutputs, "", {
      timedOut: result.timedOut,
    });
    return {
      taskId: result.taskId,
      mode: result.mode,
      evaluation,
    };
  }
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Sanitize a model identifier for use in a store file key.
 * Replaces `/` and `.` with `-` and strips other problematic characters.
 */
function sanitizeModelForId(model: string): string {
  return model.replace(/[/.]/g, "-").replace(/[^a-zA-Z0-9\-_]/g, "");
}
