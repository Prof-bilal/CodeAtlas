import type {
  BenchmarkConfig,
  BenchmarkEvaluationEntry,
  BenchmarkPort,
  BenchmarkReport,
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
import { BenchmarkMetrics } from "./metrics";
import { renderReport } from "./reporter";
import { BenchmarkStore } from "./store";

/** Options for creating a BenchmarkService. */
export interface BenchmarkServiceOptions {
  /** Root directory for benchmark data (default: `.codeatlas/benchmarks`). */
  readonly root?: string | undefined;
  /** Runners available for task execution. */
  readonly runners?: ReadonlyMap<string, BenchmarkRunner> | undefined;
  /** Metrics integration (optional). */
  readonly metrics?: BenchmarkMetrics | undefined;
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

  public constructor(options: BenchmarkServiceOptions = {}) {
    this.store = new BenchmarkStore(options.root ?? ".codeatlas/benchmarks");
    this.runners = options.runners ?? new Map();
    this.metrics = options.metrics ?? new BenchmarkMetrics();
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

    const task = this.findTask(suite, request.taskId);
    if (task === null) {
      return fail(new Error(`Task "${request.taskId}" not found in suite`));
    }

    const runner = this.runners.get(suite.config.agent);
    if (runner === undefined) {
      return fail(new Error(`No runner for agent "${suite.config.agent}"`));
    }

    this.store.updateSuiteStatus(request.suiteId, "running");

    const timeoutMs = request.timeoutMs ?? suite.config.taskTimeoutMs ?? 540_000;

    const runnerResult = await runner.execute({
      prompt: task.prompt,
      repositoryPath: request.repositoryPath,
      mode: request.mode,
      timeoutMs,
      model: suite.config.model,
    });

    if (!runnerResult.ok) {
      this.store.updateSuiteStatus(request.suiteId, "failed");
      return fail(runnerResult.error);
    }

    const rr = runnerResult.value;

    // Evaluate
    const toolOutputs = rr.toolCalls
      .map((tc) => (tc as unknown as { output?: string }).output ?? "")
      .filter((o: unknown): o is string => typeof o === "string");
    const evaluation = evaluateTask(task, rr.finalText, toolOutputs, request.repositoryPath);

    const result: BenchmarkTaskResult = {
      taskId: task.id,
      category: task.category,
      mode: request.mode,
      agent: suite.config.agent,
      model: suite.config.model,
      tokens: rr.metrics,
      cost: rr.cost,
      durationMs: rr.durationMs,
      timedOut: rr.timedOut,
      exitCode: rr.exitCode,
      finalText: rr.finalText,
      toolCallCount: rr.toolCalls.length,
      toolCalls: rr.toolCalls,
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
      model: suite.config.model,
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

    this.store.updateSuiteStatus(request.suiteId, "running");

    const results: BenchmarkTaskResult[] = [];
    const evaluations: BenchmarkEvaluationEntry[] = [];

    for (const taskDef of taskDefs) {
      if (taskFilter !== null && taskDef.id !== taskFilter) continue;

      for (const mode of modes) {
        // Skip if result exists and --force not set
        if (!request.force) {
          const existing = this.store.loadTaskResult(request.suiteId, taskDef.id, mode);
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
        });

        if (taskResult.ok) {
          results.push(taskResult.value);
          const ev = this.buildEvaluationEntry(taskResult.value, taskDef);
          if (ev !== null) evaluations.push(ev);
        }
      }
    }

    // Compute aggregates
    const baseline = results.filter((t) => t.mode === "baseline");
    const codeatlas = results.filter((t) => t.mode === "codeatlas");
    const baseTokens = baseline.reduce((s, t) => s + t.tokens.total, 0);
    const catTokens = codeatlas.reduce((s, t) => s + t.tokens.total, 0);
    const baseCost = baseline.reduce((s, t) => s + t.cost, 0);
    const catCost = codeatlas.reduce((s, t) => s + t.cost, 0);

    const baseEvals = evaluations.filter((e) => e.mode === "baseline");
    const catEvals = evaluations.filter((e) => e.mode === "codeatlas");
    const baseAvg = avg(baseEvals.map((e) => e.evaluation.score));
    const catAvg = avg(catEvals.map((e) => e.evaluation.score));

    this.store.updateSuiteStatus(request.suiteId, "completed");

    const suiteResult: BenchmarkSuiteResult = {
      suiteId: request.suiteId,
      tasks: results,
      evaluations,
      tokenSavings: baseTokens - catTokens,
      costSavings: baseCost - catCost,
      accuracyDelta: catAvg - baseAvg,
      completedAt: new Date().toISOString(),
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
    const total = taskDefs.length * suite.config.modes.length;
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
    options?: { readonly format?: "markdown" | "json" },
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
    // no-op for JSON store
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

    const evaluation = evaluateTask(taskDef, result.finalText, toolOutputs, "");
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
