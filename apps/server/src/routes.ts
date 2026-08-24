import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import { BenchmarkService, BenchmarkStore } from "@atlas/benchmark";
import type { BenchmarkRunner } from "@atlas/benchmark";
import type { BenchmarkMode } from "@atlas/sdk";
import { ApiError, type Route, type RouteHandler } from "./app";
import {
  buildStats,
  buildSuiteResultFromStore,
  buildSuiteSummary,
  markSuiteInterrupted,
  readSuiteMeta,
  runBenchmarkJob,
  suiteTaskDefs,
  toTaskModeView,
} from "./benchmark";
import { runBrowserBenchmark } from "./browser";
import type { ServerConfig } from "./config";
import { type JobManager, JobQueueFullError, publicJob } from "./jobs";
import {
  type Availability,
  type CommunityConfig,
  checkAvailability,
  cleanupRepository,
  loadCommunityConfig,
  localEntryPath,
  repositoryStats,
  resolveRepository,
} from "./repos";

/**
 * API surface of the Benchmark server. Every response is derived from real
 * data: the JSON benchmark store, live filesystem checks, or work a job
 * actually performed. Unknown values are `null` — never guessed.
 *
 * Routes (all JSON, prefixed `/api`):
 *   GET  /health
 *   GET  /benchmarks              list suites + dashboard stats
 *   POST /benchmarks              start a benchmark job (local path)
 *   GET  /benchmarks/:id          suite detail (tasks, evaluations, history)
 *   GET  /benchmarks/:id/report   markdown/html/json report content
 *   POST /benchmarks/:id/cancel   cancel the suite's active job
 *   GET  /task-files              available task definitions
 *   GET  /community/repos         curated community library (live availability)
 *   POST /community/repos/:id/run start a benchmark job for a community repo
 *   POST /browser-benchmarks      start a browser (quick test) benchmark job
 *   GET  /browser-benchmarks/:id  job + result (alias of /jobs/:id)
 *   GET  /jobs                    recent jobs
 *   GET  /jobs/:id                job status/progress/result
 *   POST /jobs/:id/cancel         request cooperative cancellation
 */
export interface RoutesDeps {
  readonly config: ServerConfig;
  readonly jobs: JobManager;
  /** Test seam: injected benchmark runners (defaults to the real set). */
  readonly runners?: ReadonlyMap<string, BenchmarkRunner> | undefined;
  /** Test seam: preloaded community config. */
  readonly community?: CommunityConfig | undefined;
}

interface BenchmarkRequestBody {
  repositoryPath?: unknown;
  repositoryId?: unknown;
  agent?: unknown;
  model?: unknown;
  modes?: unknown;
  taskFile?: unknown;
  name?: unknown;
  force?: unknown;
  suiteId?: unknown;
}

interface BrowserRequestBody {
  repositoryPath?: unknown;
  repositoryId?: unknown;
  query?: unknown;
  ai?: unknown;
}

const AVAILABILITY_CACHE_MS = 60_000;
const availabilityCache = new Map<string, { at: number; data: Availability }>();

function communityConfig(deps: RoutesDeps): CommunityConfig {
  if (deps.community !== undefined) return deps.community;
  return loadCommunityConfig(deps.config.communityConfigPath);
}

function store(deps: RoutesDeps): BenchmarkStore {
  return new BenchmarkStore(deps.config.benchmarkRoot);
}

function parseModes(raw: unknown, fallback: readonly BenchmarkMode[]): BenchmarkMode[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...fallback];
  const modes: BenchmarkMode[] = [];
  for (const m of raw) {
    if (m !== "baseline" && m !== "codeatlas") {
      throw new ApiError(
        400,
        "invalid_modes",
        `"${String(m)}" is not a valid mode (baseline|codeatlas)`,
      );
    }
    if (!modes.includes(m)) modes.push(m);
  }
  return modes;
}

function parseAgent(raw: unknown): "opencode" | "ollama" {
  if (raw === undefined || raw === null || raw === "") return "opencode";
  if (raw !== "opencode" && raw !== "ollama") {
    throw new ApiError(
      400,
      "invalid_agent",
      `"${String(raw)}" is not a valid agent (opencode|ollama)`,
    );
  }
  return raw;
}

function optionalString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;
}

/** Derive a display name for a local repository path (no network, no stats). */
function repositoryNameForPath(path: string): string {
  return basename(path.replace(/[/\\]+$/, "")) || "repository";
}

const BENCHMARK_STAGES = [
  { id: "prepare", label: "Repository prepared" },
  { id: "index", label: "Repository indexed" },
  { id: "benchmark", label: "Benchmark tasks" },
  { id: "report", label: "Final report" },
] as const;

interface StartBenchmarkInput {
  readonly repositoryPath?: string | undefined;
  readonly repositoryId?: string | undefined;
  readonly suiteId?: string | undefined;
  readonly agent: "opencode" | "ollama";
  readonly model: string;
  readonly modes: BenchmarkMode[];
  readonly taskFile?: string | undefined;
  readonly name?: string | undefined;
  readonly force?: boolean | undefined;
}

function startBenchmarkJob(
  deps: RoutesDeps,
  input: StartBenchmarkInput,
): {
  jobId: string;
  suiteId?: string | undefined;
} {
  const { jobs, config } = deps;
  const community =
    input.repositoryId !== undefined
      ? communityConfig(deps).repositories.find((r) => r.id === input.repositoryId)
      : undefined;
  if (input.repositoryId !== undefined && community === undefined) {
    throw new ApiError(
      404,
      "repository_not_found",
      `Unknown community repository "${input.repositoryId}"`,
    );
  }
  if (input.repositoryId === undefined) {
    const p = input.repositoryPath;
    if (p === undefined || p.trim() === "") {
      throw new ApiError(400, "repository_required", "Provide repositoryPath or repositoryId");
    }
    if (!existsSync(p) || !statSync(p).isDirectory()) {
      throw new ApiError(400, "repository_unavailable", `Repository path is not a directory: ${p}`);
    }
  }

  const job = jobs.create(
    "benchmark",
    {
      repository: {
        id: input.repositoryId,
        name:
          input.repositoryPath !== undefined
            ? repositoryNameForPath(input.repositoryPath)
            : (community?.name ?? "repository"),
        path: input.repositoryPath,
      },
      suiteId: input.suiteId,
      stages: BENCHMARK_STAGES,
    },
    async (ctx) => {
      let cleanup: { path: string } | null = null;
      try {
        ctx.startStage("prepare");
        const resolved =
          community !== undefined
            ? await resolveRepository(community, config.cloneTimeoutMs)
            : {
                path: input.repositoryPath as string,
                name: repositoryNameForPath(input.repositoryPath as string),
                temporary: false,
                entry: undefined,
              };
        if (resolved.temporary) cleanup = { path: resolved.path };
        ctx.finishStage("prepare", "done", resolved.name);
        return await runBenchmarkJob(
          ctx,
          config.benchmarkRoot,
          {
            repositoryPath: resolved.path,
            repositoryName: resolved.name,
            repositoryUrl: community?.url,
            repositoryId: input.repositoryId,
            temporary: resolved.temporary,
            suiteId: input.suiteId,
            agent: input.agent,
            model: input.model,
            modes: input.modes,
            taskFile: input.taskFile,
            name: input.name,
            force: input.force,
          },
          deps.runners,
        );
      } finally {
        if (cleanup !== null) {
          cleanupRepository({ path: cleanup.path, name: "", temporary: true });
        }
        if (ctx.job.status === "cancelled" && ctx.job.suiteId !== undefined) {
          markSuiteInterrupted(config.benchmarkRoot, ctx.job.suiteId);
        }
      }
    },
  );
  return { jobId: job.id, suiteId: job.suiteId };
}

function latestBenchmarkForName(deps: RoutesDeps, name: string) {
  const s = store(deps);
  const summaries = s
    .listSuites()
    .map((suite) => buildSuiteSummary(deps.config.benchmarkRoot, s, suite))
    .filter((x) => x.repository.name.toLowerCase() === name.toLowerCase() && x.metrics !== null)
    .sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""));
  const best = summaries[0];
  if (best === undefined) return null;
  return {
    suiteId: best.id,
    completedAt: best.lastRunAt,
    tokenSavingsPct: best.metrics?.tokenSavingsPct ?? null,
    accuracyDelta: best.metrics?.accuracyDelta ?? null,
    score: best.score?.value ?? null,
  };
}

async function availabilityFor(deps: RoutesDeps, entryId: string): Promise<Availability> {
  const cached = availabilityCache.get(entryId);
  if (cached !== undefined && Date.now() - cached.at < AVAILABILITY_CACHE_MS) {
    return cached.data;
  }
  const community = communityConfig(deps).repositories.find((r) => r.id === entryId);
  if (community === undefined) {
    return { available: false, checked: "local-fs", detail: "entry missing from config" };
  }
  const data = await checkAvailability(community, deps.config.availabilityTimeoutMs);
  availabilityCache.set(entryId, { at: Date.now(), data });
  return data;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function listBenchmarks(deps: RoutesDeps): Promise<unknown> {
  const s = store(deps);
  const summaries = s
    .listSuites()
    .map((suite) => buildSuiteSummary(deps.config.benchmarkRoot, s, suite));
  return { suites: summaries, stats: buildStats(summaries) };
}

async function suiteDetail(deps: RoutesDeps, suiteId: string): Promise<unknown> {
  const s = store(deps);
  const suite = s.loadSuite(suiteId);
  if (suite === null) {
    throw new ApiError(404, "suite_not_found", `Suite "${suiteId}" not found`);
  }
  const summary = buildSuiteSummary(deps.config.benchmarkRoot, s, suite);
  const aggregated = buildSuiteResultFromStore(s, suite);
  const results = aggregated?.tasks ?? [];
  const defs = suiteTaskDefs(s, suite).flatMap((tf) => tf.tasks);

  const tasks = defs.map((def) => {
    const modes: Record<string, unknown> = {};
    for (const mode of suite.config.modes) {
      const result = results.find((r) => r.taskId === def.id && r.mode === mode);
      if (result === undefined) continue;
      const evaluation = aggregated?.evaluations.find(
        (e) => e.taskId === def.id && e.mode === mode,
      );
      modes[mode] = toTaskModeView(result, evaluation);
    }
    return {
      taskId: def.id,
      category: def.category,
      promptExcerpt: def.prompt.slice(0, 300),
      expectedFiles: def.expected_files,
      modes,
    };
  });

  const meta = readSuiteMeta(deps.config.benchmarkRoot, suiteId);
  let repositoryDetail: unknown = null;
  if (
    meta !== null &&
    existsSync(meta.repositoryPath) &&
    statSync(meta.repositoryPath).isDirectory()
  ) {
    repositoryDetail = await repositoryStats(meta.repositoryPath);
  }

  const history = s
    .listSuites()
    .map((other) => buildSuiteSummary(deps.config.benchmarkRoot, s, other))
    .filter((x) => x.repository.name.toLowerCase() === summary.repository.name.toLowerCase())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((x) => ({
      suiteId: x.id,
      name: x.name,
      status: x.status,
      createdAt: x.createdAt,
      lastRunAt: x.lastRunAt,
      tokenSavingsPct: x.metrics?.tokenSavingsPct ?? null,
      accuracyDelta: x.metrics?.accuracyDelta ?? null,
      score: x.score?.value ?? null,
    }));

  const activeJob = deps.jobs.findBySuite(suiteId);

  return { suite: summary, tasks, repositoryDetail, history, activeJobId: activeJob?.id ?? null };
}

async function suiteReport(deps: RoutesDeps, suiteId: string, format: string): Promise<unknown> {
  const allowed = ["markdown", "html", "json"];
  if (!allowed.includes(format)) {
    throw new ApiError(400, "invalid_format", `format must be one of ${allowed.join(", ")}`);
  }
  const service = new BenchmarkService({
    root: deps.config.benchmarkRoot,
    runners: deps.runners ?? new Map(),
  });
  const report = await service.generateReport(suiteId, {
    format: format as "markdown" | "html" | "json",
  });
  if (!report.ok) {
    throw new ApiError(404, "report_failed", report.error.message);
  }
  return {
    suiteId,
    format: report.value.format,
    generatedAt: report.value.generatedAt,
    content: report.value.content,
  };
}

function startBrowserJob(deps: RoutesDeps, body: BrowserRequestBody): { jobId: string } {
  const { jobs, config } = deps;
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query === "") throw new ApiError(400, "query_required", "Provide a non-empty query");
  const ai = body.ai === true;
  const repositoryId = optionalString(body.repositoryId);
  const repositoryPath = optionalString(body.repositoryPath);

  const community =
    repositoryId !== undefined
      ? communityConfig(deps).repositories.find((r) => r.id === repositoryId)
      : undefined;
  if (repositoryId !== undefined && community === undefined) {
    throw new ApiError(
      404,
      "repository_not_found",
      `Unknown community repository "${repositoryId}"`,
    );
  }
  if (repositoryId === undefined) {
    if (repositoryPath === undefined) {
      throw new ApiError(400, "repository_required", "Provide repositoryPath or repositoryId");
    }
    if (!existsSync(repositoryPath) || !statSync(repositoryPath).isDirectory()) {
      throw new ApiError(
        400,
        "repository_unavailable",
        `Repository path is not a directory: ${repositoryPath}`,
      );
    }
  }

  const stages = [
    { id: "prepare", label: "Repository scanned" },
    { id: "index", label: "Repository indexed" },
    { id: "retrieve", label: "Context retrieval" },
    { id: "package", label: "Context assembly" },
    ...(ai ? [{ id: "answer", label: "AI answer" }] : []),
  ];

  const job = jobs.create(
    "browser",
    {
      repository: {
        id: repositoryId,
        name:
          repositoryPath !== undefined
            ? repositoryNameForPath(repositoryPath)
            : (community?.name ?? "repository"),
        path: repositoryPath,
      },
      query,
      stages,
    },
    async (ctx) => {
      let cleanup: { path: string } | null = null;
      try {
        const resolved =
          community !== undefined
            ? await resolveRepository(community, config.cloneTimeoutMs)
            : {
                path: repositoryPath as string,
                name: repositoryNameForPath(repositoryPath as string),
                temporary: false,
                entry: undefined,
              };
        if (resolved.temporary) cleanup = { path: resolved.path };
        return await runBrowserBenchmark(ctx, {
          repositoryPath: resolved.path,
          repositoryName: resolved.name,
          repositoryUrl: community?.url,
          query,
          ai,
        });
      } finally {
        if (cleanup !== null) {
          cleanupRepository({ path: cleanup.path, name: "", temporary: true });
        }
      }
    },
  );
  return { jobId: job.id };
}

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

export function createRoutes(deps: RoutesDeps): Route[] {
  /** Translate a full job queue into an honest 429. */
  const wrapJobRoute =
    (handler: RouteHandler): RouteHandler =>
    (ctx) => {
      try {
        return handler(ctx);
      } catch (err) {
        if (err instanceof JobQueueFullError) {
          throw new ApiError(429, "queue_full", err.message);
        }
        throw err;
      }
    };

  const benchmarkPost: RouteHandler = (ctx) => {
    const body = (ctx.body ?? {}) as BenchmarkRequestBody;
    const agent = parseAgent(body.agent);
    const model =
      optionalString(body.model) ??
      (agent === "ollama" ? "qwen2.5-coder:1.5b" : "opencode/deepseek-v4-flash-free");
    return startBenchmarkJob(deps, {
      repositoryPath: optionalString(body.repositoryPath),
      repositoryId: optionalString(body.repositoryId),
      suiteId: optionalString(body.suiteId),
      agent,
      model,
      modes: parseModes(body.modes, ["baseline", "codeatlas"]),
      taskFile: optionalString(body.taskFile),
      name: optionalString(body.name),
      force: body.force === true,
    });
  };

  return [
    {
      method: "GET",
      pattern: "/health",
      handler: () => ({
        ok: true,
        service: "atlas-benchmark-api",
        benchmarkRoot: deps.config.benchmarkRoot,
        uptimeMs: Math.round(process.uptime() * 1000),
      }),
    },
    {
      method: "GET",
      pattern: "/benchmarks",
      handler: () => listBenchmarks(deps),
    },
    {
      method: "POST",
      pattern: "/benchmarks",
      handler: wrapJobRoute(benchmarkPost),
    },
    {
      method: "GET",
      pattern: "/benchmarks/:id",
      handler: (ctx) => suiteDetail(deps, ctx.params["id"]),
    },
    {
      method: "GET",
      pattern: "/benchmarks/:id/report",
      handler: (ctx) => suiteReport(deps, ctx.params["id"], ctx.query.get("format") ?? "markdown"),
    },
    {
      method: "POST",
      pattern: "/benchmarks/:id/cancel",
      handler: (ctx) => {
        const job = deps.jobs.findBySuite(ctx.params["id"]);
        if (job === undefined) {
          throw new ApiError(409, "no_active_job", `No active job for suite "${ctx.params["id"]}"`);
        }
        deps.jobs.cancel(job.id);
        return { jobId: job.id, cancelled: true };
      },
    },
    {
      method: "GET",
      pattern: "/task-files",
      handler: () => {
        const files = store(deps).listTaskFiles();
        return {
          taskFiles: files.map((tf) => ({
            repository: tf.repository,
            name: tf.name,
            version: tf.version,
            tasks: tf.tasks.length,
            hasExpectations: tf.tasks.some((t) => t.expected_files.length > 0),
          })),
        };
      },
    },
    {
      method: "GET",
      pattern: "/community/repos",
      handler: async () => {
        const entries = communityConfig(deps).repositories;
        const repos = await Promise.all(
          entries.map(async (entry) => {
            const availability = await availabilityFor(deps, entry.id);
            let stats: unknown = null;
            if (entry.source === "local" && availability.available && entry.path !== undefined) {
              stats = await repositoryStats(localEntryPath(entry));
            }
            return {
              id: entry.id,
              name: entry.name,
              description: entry.description ?? null,
              url: entry.url ?? null,
              source: entry.source,
              difficulty: entry.difficulty ?? null,
              languages: entry.languages ?? null,
              availability,
              stats,
              benchmark: latestBenchmarkForName(deps, entry.name),
            };
          }),
        );
        return { repos };
      },
    },
    {
      method: "POST",
      pattern: "/community/repos/:id/run",
      handler: wrapJobRoute((ctx) => {
        const body = (ctx.body ?? {}) as BenchmarkRequestBody;
        const agent = parseAgent(body.agent);
        const model =
          optionalString(body.model) ??
          (agent === "ollama" ? "qwen2.5-coder:1.5b" : "opencode/deepseek-v4-flash-free");
        return startBenchmarkJob(deps, {
          repositoryId: ctx.params["id"],
          agent,
          model,
          modes: parseModes(body.modes, ["baseline", "codeatlas"]),
          taskFile: optionalString(body.taskFile),
          name: optionalString(body.name),
          force: body.force === true,
        });
      }),
    },
    {
      method: "POST",
      pattern: "/browser-benchmarks",
      handler: wrapJobRoute((ctx) => startBrowserJob(deps, (ctx.body ?? {}) as BrowserRequestBody)),
    },
    {
      method: "GET",
      pattern: "/browser-benchmarks/:id",
      handler: (ctx) => {
        const job = deps.jobs.get(ctx.params["id"]);
        if (job === undefined)
          throw new ApiError(404, "job_not_found", `Job "${ctx.params["id"]}" not found`);
        return publicJob(job);
      },
    },
    {
      method: "GET",
      pattern: "/jobs",
      handler: () => ({ jobs: deps.jobs.list().map(publicJob) }),
    },
    {
      method: "GET",
      pattern: "/jobs/:id",
      handler: (ctx) => {
        const job = deps.jobs.get(ctx.params["id"]);
        if (job === undefined)
          throw new ApiError(404, "job_not_found", `Job "${ctx.params["id"]}" not found`);
        return publicJob(job);
      },
    },
    {
      method: "POST",
      pattern: "/jobs/:id/cancel",
      handler: (ctx) => {
        const id = ctx.params["id"];
        if (deps.jobs.get(id) === undefined) {
          throw new ApiError(404, "job_not_found", `Job "${id}" not found`);
        }
        const ok = deps.jobs.cancel(id);
        if (!ok) throw new ApiError(409, "not_cancellable", `Job "${id}" is not running or queued`);
        return { jobId: id, cancelled: true };
      },
    },
  ];
}
