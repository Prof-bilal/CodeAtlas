import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BenchmarkService,
  BenchmarkStore,
  OllamaRunner,
  OpenCodeRunner,
  evaluateTask,
  scaffoldTaskFile,
} from "@atlas/benchmark";
import type { BenchmarkRunner } from "@atlas/benchmark";
import { createContextToolSourceFromSDK } from "@atlas/mcp";
import {
  ProviderChatAgent,
  ToolUsingChatAgent,
  createContextSDK,
  createProviderService,
  indexProject,
} from "@atlas/sdk";
import type {
  BenchmarkConfig,
  BenchmarkEvaluationEntry,
  BenchmarkMode,
  BenchmarkSuite,
  BenchmarkSuiteResult,
  BenchmarkTaskResult,
  ChatAgentPort,
  ChatAgentRequest,
  ChatAgentResult,
  ProviderPort,
  Result,
  TaskFile,
} from "@atlas/sdk";
import type { JobContext } from "./jobs";

// ---------------------------------------------------------------------------
// Service composition (mirrors the CLI composition root)
// ---------------------------------------------------------------------------

/**
 * CodeAtlas-mode chat agent for Ollama benchmark runs: opens the repository's
 * Context SDK per task and runs the bounded tool loop against the MCP context
 * tools (reusing the exact tool definitions MCP serves — no second registry).
 * Same composition as `apps/cli`'s benchmark command; composition roots may
 * differ, the building blocks do not.
 */
export class RepositoryToolLoopAgent implements ChatAgentPort {
  public readonly providers = ["ollama"];

  public constructor(private readonly provider: ProviderPort) {}

  public handles(provider: string): boolean {
    return provider === "ollama";
  }

  public async run(request: ChatAgentRequest): Promise<Result<ChatAgentResult>> {
    const sdk = createContextSDK({ repositoryPath: request.repositoryPath });
    try {
      const toolSource = createContextToolSourceFromSDK(sdk);
      const agent = new ToolUsingChatAgent(this.provider, toolSource, ["ollama"]);
      return await agent.run(request);
    } finally {
      sdk.close();
    }
  }
}

export const DEFAULT_BENCHMARK_MODELS: Readonly<Record<"opencode" | "ollama", string>> = {
  opencode: "opencode/deepseek-v4-flash-free",
  ollama: "qwen2.5-coder:1.5b",
};

export function createOllamaRunner(): OllamaRunner {
  const providers = createProviderService();
  return new OllamaRunner({
    baseline: new ProviderChatAgent(providers, ["ollama"]),
    codeatlas: new RepositoryToolLoopAgent(providers),
  });
}

/** Runners available to the server (same set the CLI registers). */
export function defaultRunners(): ReadonlyMap<string, BenchmarkRunner> {
  const runners = new Map<string, BenchmarkRunner>();
  runners.set("opencode", new OpenCodeRunner());
  runners.set("ollama", createOllamaRunner());
  return runners;
}

// ---------------------------------------------------------------------------
// Suite repository sidecar (server-owned metadata, additive to the store)
// ---------------------------------------------------------------------------

/** Server-written suite metadata: where the benchmarked repository lives. */
export interface SuiteRepositoryMeta {
  readonly repositoryPath: string;
  readonly repositoryId?: string | undefined;
  readonly repositoryName: string;
  readonly repositoryUrl?: string | undefined;
  readonly temporary?: boolean | undefined;
  readonly createdAt: string;
  interruptedAt?: string | undefined;
}

function suiteMetaPath(root: string, suiteId: string): string {
  return join(root, "suites", suiteId, "repository.json");
}

export function readSuiteMeta(root: string, suiteId: string): SuiteRepositoryMeta | null {
  const p = suiteMetaPath(root, suiteId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SuiteRepositoryMeta;
  } catch {
    return null;
  }
}

export function writeSuiteMeta(root: string, suiteId: string, meta: SuiteRepositoryMeta): void {
  const p = suiteMetaPath(root, suiteId);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(meta, null, 2));
}

export function markSuiteInterrupted(root: string, suiteId: string): void {
  const meta = readSuiteMeta(root, suiteId);
  if (meta === null) return;
  writeSuiteMeta(root, suiteId, {
    ...meta,
    interruptedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Derived metrics + score (computed only from measured suite results)
// ---------------------------------------------------------------------------

export interface SuiteMetrics {
  readonly taskCount: number;
  readonly baselineTokens: number;
  readonly codeatlasTokens: number;
  readonly tokenSavings: number;
  /** `null` when no baseline tokens were measured (division impossible). */
  readonly tokenSavingsPct: number | null;
  readonly costSavings: number;
  readonly baselineAvgScore: number;
  readonly codeatlasAvgScore: number;
  readonly accuracyDelta: number;
  readonly avgDurationMsBaseline: number;
  readonly avgDurationMsCodeatlas: number;
  readonly toolCallsCodeatlas: number;
  readonly avgDurationMs: number;
  readonly completedAt: string;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function extractSuiteMetrics(raw: BenchmarkSuiteResult): SuiteMetrics {
  const baseline = raw.tasks.filter((t) => t.mode === "baseline");
  const codeatlas = raw.tasks.filter((t) => t.mode === "codeatlas");
  const baselineTokens = baseline.reduce((s, t) => s + t.tokens.total, 0);
  const codeatlasTokens = codeatlas.reduce((s, t) => s + t.tokens.total, 0);
  const scoreFor = (mode: BenchmarkMode): number[] =>
    raw.evaluations.filter((e) => e.mode === mode).map((e) => e.evaluation.score);
  return {
    taskCount: raw.tasks.length,
    baselineTokens,
    codeatlasTokens,
    tokenSavings: raw.tokenSavings,
    tokenSavingsPct:
      baselineTokens > 0 ? round2((1 - codeatlasTokens / baselineTokens) * 100) : null,
    costSavings: raw.costSavings,
    baselineAvgScore: round2(avg(scoreFor("baseline"))),
    codeatlasAvgScore: round2(avg(scoreFor("codeatlas"))),
    accuracyDelta: round2(raw.accuracyDelta),
    avgDurationMsBaseline: Math.round(avg(baseline.map((t) => t.durationMs))),
    avgDurationMsCodeatlas: Math.round(avg(codeatlas.map((t) => t.durationMs))),
    toolCallsCodeatlas: codeatlas.reduce((s, t) => s + t.toolCallCount, 0),
    avgDurationMs: Math.round(avg(raw.tasks.map((t) => t.durationMs))),
    completedAt: raw.completedAt,
  };
}

export interface SuiteScore {
  readonly value: number;
  readonly inputs: { readonly tokenSavingsPct: number; readonly accuracyDelta: number };
  readonly formula: string;
}

export const SCORE_FORMULA =
  "50 + 25·clamp(tokenSavings% ÷ 50, −1, +1) + 25·clamp(accuracyDelta, −1, +1)";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Transparent 0–100 display score over measured inputs only. The formula is
 * returned with the value so the UI can show exactly how it was computed;
 * `null` when the inputs were never measured.
 */
export function computeScore(metrics: SuiteMetrics): SuiteScore | null {
  if (metrics.tokenSavingsPct === null) return null;
  const value = Math.round(
    50 + 25 * clamp(metrics.tokenSavingsPct / 50, -1, 1) + 25 * clamp(metrics.accuracyDelta, -1, 1),
  );
  return {
    value,
    inputs: { tokenSavingsPct: metrics.tokenSavingsPct, accuracyDelta: metrics.accuracyDelta },
    formula: SCORE_FORMULA,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Suite summaries / detail views
// ---------------------------------------------------------------------------

export interface SuiteRepositoryLabel {
  readonly name: string;
  readonly version?: string | undefined;
  readonly url?: string | undefined;
  readonly path?: string | undefined;
  readonly repositoryId?: string | undefined;
}

export interface SuiteSummary {
  readonly id: string;
  readonly name: string;
  readonly status: BenchmarkSuite["status"];
  readonly createdAt: string;
  readonly agent: string;
  readonly model: string;
  readonly modes: readonly BenchmarkMode[];
  readonly repository: SuiteRepositoryLabel;
  readonly tasks: { readonly total: number; readonly completed: number };
  readonly lastRunAt: string | null;
  readonly metrics: SuiteMetrics | null;
  readonly score: SuiteScore | null;
  readonly scaffoldedTasks: boolean;
}

export function suiteTaskDefs(store: BenchmarkStore, suite: BenchmarkSuite): TaskFile[] {
  const files: TaskFile[] = [];
  for (const name of suite.taskFiles) {
    const tf = store.loadTaskFile(name);
    if (tf !== null) files.push(tf);
  }
  return files;
}

export function suiteRepositoryLabel(
  root: string,
  store: BenchmarkStore,
  suite: BenchmarkSuite,
): SuiteRepositoryLabel {
  const meta = readSuiteMeta(root, suite.id);
  if (meta !== null) {
    return {
      name: meta.repositoryName,
      url: meta.repositoryUrl,
      path: existsSync(meta.repositoryPath) ? meta.repositoryPath : undefined,
      repositoryId: meta.repositoryId,
    };
  }
  const tf = suiteTaskDefs(store, suite)[0];
  if (tf !== undefined) {
    return { name: tf.name, version: tf.version };
  }
  return { name: suite.name };
}

/**
 * Aggregate the suite's *actual persisted task results*, re-evaluated with the
 * benchmark evaluator — not the possibly-stale `raw-results.json` (a filtered
 * CLI `--task` run overwrites it with a subset). Falls back to the stored raw
 * results only when no per-task files exist.
 */
export function buildSuiteResultFromStore(
  store: BenchmarkStore,
  suite: BenchmarkSuite,
): BenchmarkSuiteResult | null {
  const results = store.listTaskResults(suite.id);
  if (results.length === 0) {
    const raw = store.loadRawResults(suite.id) as BenchmarkSuiteResult | null;
    return raw !== null && Array.isArray(raw.tasks) ? raw : null;
  }
  const defs = new Map(
    suiteTaskDefs(store, suite)
      .flatMap((tf) => tf.tasks)
      .map((t) => [t.id, t]),
  );
  const evaluations: BenchmarkEvaluationEntry[] = [];
  for (const result of results) {
    const def = defs.get(result.taskId);
    if (def === undefined) continue;
    const toolOutputs = result.toolCalls
      .map((tc) => (tc as unknown as { output?: string }).output ?? "")
      .filter((o: unknown): o is string => typeof o === "string");
    evaluations.push({
      taskId: result.taskId,
      mode: result.mode,
      evaluation: evaluateTask(def, result.finalText, toolOutputs, ""),
    });
  }
  const baseline = results.filter((t) => t.mode === "baseline");
  const codeatlas = results.filter((t) => t.mode === "codeatlas");
  const baseTokens = baseline.reduce((s, t) => s + t.tokens.total, 0);
  const catTokens = codeatlas.reduce((s, t) => s + t.tokens.total, 0);
  const avgScore = (mode: BenchmarkMode): number => {
    const scores = evaluations.filter((e) => e.mode === mode).map((e) => e.evaluation.score);
    return scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length;
  };
  return {
    suiteId: suite.id,
    tasks: results,
    evaluations,
    tokenSavings: baseTokens - catTokens,
    costSavings:
      baseline.reduce((s, t) => s + t.cost, 0) - codeatlas.reduce((s, t) => s + t.cost, 0),
    accuracyDelta: avgScore("codeatlas") - avgScore("baseline"),
    completedAt:
      results
        .map((r) => r.recordedAt)
        .sort()
        .at(-1) ?? suite.createdAt,
  };
}

export function buildSuiteSummary(
  root: string,
  store: BenchmarkStore,
  suite: BenchmarkSuite,
): SuiteSummary {
  const defs = suiteTaskDefs(store, suite).flatMap((tf) => tf.tasks);
  const results = store.listTaskResults(suite.id);
  const aggregated = buildSuiteResultFromStore(store, suite);
  const metrics = aggregated !== null ? extractSuiteMetrics(aggregated) : null;
  const lastRunAt =
    metrics?.completedAt ??
    (results.length > 0
      ? (results
          .map((r) => r.recordedAt)
          .sort()
          .at(-1) ?? null)
      : null);
  return {
    id: suite.id,
    name: suite.name,
    status: suite.status,
    createdAt: suite.createdAt,
    agent: suite.config.agent,
    model: suite.config.model,
    modes: [...suite.config.modes],
    repository: suiteRepositoryLabel(root, store, suite),
    tasks: { total: defs.length * suite.config.modes.length, completed: results.length },
    lastRunAt,
    metrics,
    score: metrics !== null ? computeScore(metrics) : null,
    scaffoldedTasks: defs.some(
      (t) => t.expected_files.length === 0 && t.expected_concepts.length === 0,
    ),
  };
}

export interface BenchmarkStats {
  readonly repositoriesTested: number;
  readonly totalBenchmarks: number;
  readonly totalTaskRuns: number;
  readonly avgTokenSavingsPct: number | null;
  readonly avgScore: number | null;
  readonly avgExecutionTimeMs: number | null;
}

/** Aggregate dashboard statistics — means over measured values only, else `null`. */
export function buildStats(summaries: readonly SuiteSummary[]): BenchmarkStats {
  const completed = summaries.filter((s) => s.metrics !== null);
  const pcts = completed
    .map((s) => s.metrics?.tokenSavingsPct)
    .filter((v): v is number => v !== null && v !== undefined);
  const scores = completed.map((s) => s.score?.value).filter((v): v is number => v !== undefined);
  const durations = completed
    .map((s) => s.metrics?.avgDurationMs)
    .filter((v): v is number => v !== undefined);
  return {
    repositoriesTested: new Set(completed.map((s) => s.repository.name)).size,
    totalBenchmarks: summaries.length,
    totalTaskRuns: summaries.reduce((s, x) => s + x.tasks.completed, 0),
    avgTokenSavingsPct: pcts.length > 0 ? round2(avg(pcts)) : null,
    avgScore: scores.length > 0 ? Math.round(avg(scores)) : null,
    avgExecutionTimeMs: durations.length > 0 ? Math.round(avg(durations)) : null,
  };
}

// ---------------------------------------------------------------------------
// Job body: create + run a suite with per-task progress
// ---------------------------------------------------------------------------

export interface RunBenchmarkJobInput {
  readonly repositoryPath: string;
  readonly repositoryName: string;
  readonly repositoryUrl?: string | undefined;
  readonly repositoryId?: string | undefined;
  readonly temporary?: boolean | undefined;
  /** Re-run an existing suite instead of creating a new one. */
  readonly suiteId?: string | undefined;
  readonly agent: "opencode" | "ollama";
  readonly model: string;
  readonly modes: readonly BenchmarkMode[];
  /** Existing task-file filename inside the benchmark store. */
  readonly taskFile?: string | undefined;
  readonly name?: string | undefined;
  readonly force?: boolean | undefined;
}

export interface RunBenchmarkJobResult {
  readonly suiteId: string;
  readonly reused: number;
  readonly ran: number;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "repo"
  );
}

function uniqueSuiteId(store: BenchmarkStore, base: string): string {
  let id = base;
  let n = 2;
  while (store.loadSuite(id) !== null) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

/**
 * Execute a benchmark suite as a job: resolve → (create suite) → index → run
 * tasks one-by-one (so progress is real) → finalize aggregates + report.
 *
 * Per-task execution goes through `BenchmarkService.runTask` and the final
 * `runSuite` call takes the store's resume path (every result already exists),
 * which computes the aggregates and marks the suite completed — no changes to
 * `@atlas/benchmark` needed for progress reporting.
 */
export async function runBenchmarkJob(
  ctx: JobContext,
  root: string,
  input: RunBenchmarkJobInput,
  runners: ReadonlyMap<string, BenchmarkRunner> = defaultRunners(),
): Promise<RunBenchmarkJobResult> {
  const service = new BenchmarkService({ root, runners });
  const store = new BenchmarkStore(root);
  const repositoryPath = input.repositoryPath;

  if (!existsSync(repositoryPath)) {
    throw new Error(`Repository path does not exist: ${repositoryPath}`);
  }

  let suiteId: string;
  let config: BenchmarkConfig;
  let scaffolded = false;
  if (input.suiteId !== undefined) {
    const suite = store.loadSuite(input.suiteId);
    if (suite === null) throw new Error(`Suite "${input.suiteId}" not found`);
    suiteId = suite.id;
    config = suite.config;
    writeSuiteMeta(root, suiteId, {
      ...(readSuiteMeta(root, suiteId) ?? {
        repositoryPath,
        repositoryName: input.repositoryName,
        createdAt: new Date().toISOString(),
      }),
      repositoryPath,
      repositoryName: input.repositoryName,
      repositoryUrl: input.repositoryUrl,
      repositoryId: input.repositoryId,
    });
  } else {
    suiteId = uniqueSuiteId(store, `${slugify(input.repositoryName)}-bench`);
    config = {
      id: suiteId,
      name: input.name ?? `${input.repositoryName} Benchmark`,
      agent: input.agent,
      model: input.model,
      modes: [...input.modes],
    };
    const created = await service.initSuite(config);
    if (!created.ok) throw new Error(created.error.message);

    const taskFilename = `${suiteId}-tasks.json`;
    if (input.taskFile !== undefined) {
      const tf = store.loadTaskFile(input.taskFile);
      if (tf === null)
        throw new Error(`Task file "${input.taskFile}" not found in the benchmark store`);
      store.saveTaskFile(tf, taskFilename);
    } else {
      scaffolded = true;
      store.saveTaskFile(
        scaffoldTaskFile(slugify(input.repositoryName), input.repositoryName, repositoryPath),
        taskFilename,
      );
    }
    store.saveSuite({ ...created.value, taskFiles: [taskFilename] });
    writeSuiteMeta(root, suiteId, {
      repositoryPath,
      repositoryId: input.repositoryId,
      repositoryName: input.repositoryName,
      repositoryUrl: input.repositoryUrl,
      temporary: input.temporary,
      createdAt: new Date().toISOString(),
    });
  }
  ctx.job.suiteId = suiteId;

  const suite = store.loadSuite(suiteId);
  if (suite === null) throw new Error(`Suite "${suiteId}" disappeared`);
  const modes = input.modes.length > 0 ? [...input.modes] : [...suite.config.modes];

  // Index (only needed for codeatlas mode; mirrors the CLI's ensureIndexed).
  if (modes.includes("codeatlas")) {
    ctx.startStage("index");
    ctx.throwIfCancelled();
    const dbPath = join(repositoryPath, ".codeatlas", "context.db");
    if (existsSync(dbPath)) {
      ctx.finishStage("index", "skipped", "index already present");
    } else {
      const startedAt = performance.now();
      const result = await indexProject({ repositoryPath, mode: "build" });
      if (!result.ok) throw new Error(`Indexing failed: ${result.error.message}`);
      ctx.finishStage(
        "index",
        "done",
        `indexed ${result.value.files} files · ${Math.round(performance.now() - startedAt)}ms`,
      );
    }
  }

  const defs = suiteTaskDefs(store, suite).flatMap((tf) => tf.tasks);
  if (defs.length === 0) throw new Error("Suite has no task definitions");
  const plan: { taskId: string; mode: BenchmarkMode }[] = [];
  for (const def of defs) {
    for (const mode of modes) plan.push({ taskId: def.id, mode });
  }

  ctx.startStage("benchmark");
  ctx.throwIfCancelled();
  ctx.setProgress(0, plan.length);
  let ran = 0;
  let reused = 0;
  let done = 0;
  for (const step of plan) {
    ctx.throwIfCancelled();
    if (!input.force) {
      const existing = store.loadTaskResult(suiteId, step.taskId, step.mode);
      if (existing !== null) {
        reused += 1;
        done += 1;
        ctx.setProgress(done, plan.length);
        continue;
      }
    }
    ctx.setCurrentTask(`${step.taskId} · ${step.mode}`);
    const result = await service.runTask({
      suiteId,
      taskId: step.taskId,
      mode: step.mode,
      repositoryPath,
    });
    if (!result.ok) {
      throw new Error(`Task ${step.taskId} (${step.mode}) failed: ${result.error.message}`);
    }
    ran += 1;
    done += 1;
    ctx.setProgress(done, plan.length);
    ctx.stageDetail("benchmark", `${done}/${plan.length} task runs`);
  }
  ctx.finishStage(
    "benchmark",
    "done",
    `${plan.length} task runs (${ran} executed${reused > 0 ? `, ${reused} reused from previous runs` : ""})`,
  );
  ctx.setCurrentTask(undefined);
  ctx.throwIfCancelled();

  ctx.startStage("report");
  const finalized = await service.runSuite({ suiteId, repositoryPath, modes, force: false });
  if (!finalized.ok) throw new Error(`Finalizing suite failed: ${finalized.error.message}`);
  const report = await service.generateReport(suiteId, { format: "markdown" });
  if (!report.ok) throw new Error(`Generating report failed: ${report.error.message}`);
  ctx.finishStage(
    "report",
    "done",
    scaffolded
      ? "report generated (scaffolded task file — add expected_files/concepts for meaningful scores)"
      : "report generated",
  );

  return { suiteId, reused, ran };
}

/** View of one task/mode result (excerpts only; full text stays server-side). */
export interface TaskModeView {
  readonly mode: BenchmarkMode;
  readonly agent: string;
  readonly model: string;
  readonly tokens: BenchmarkTaskResult["tokens"];
  readonly cost: number;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly toolCallCount: number;
  readonly error?: string | undefined;
  readonly evaluation?:
    | {
        readonly status: string;
        readonly score: number;
        readonly fileRatio: number;
        readonly conceptRatio: number;
        readonly filesFound: readonly string[];
        readonly filesExpected: readonly string[];
        readonly conceptsFound: readonly string[];
      }
    | undefined;
  readonly finalTextExcerpt: string;
}

export function toTaskModeView(
  result: BenchmarkTaskResult,
  evaluation: BenchmarkSuiteResult["evaluations"][number] | undefined,
  excerptChars = 2000,
): TaskModeView {
  return {
    mode: result.mode,
    agent: result.agent,
    model: result.model,
    tokens: result.tokens,
    cost: result.cost,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    toolCallCount: result.toolCallCount,
    error: result.error,
    evaluation:
      evaluation !== undefined
        ? {
            status: evaluation.evaluation.status,
            score: evaluation.evaluation.score,
            fileRatio: evaluation.evaluation.fileRatio,
            conceptRatio: evaluation.evaluation.conceptRatio,
            filesFound: evaluation.evaluation.filesFound,
            filesExpected: evaluation.evaluation.filesExpected,
            conceptsFound: evaluation.evaluation.conceptsFound,
          }
        : undefined,
    finalTextExcerpt: result.finalText.slice(0, excerptChars),
  };
}
