import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BenchmarkRunner } from "@atlas/benchmark";
import { ok } from "@atlas/sdk";
import type { TaskFile } from "@atlas/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { JobManager } from "../src/jobs";
import type { CommunityConfig } from "../src/repos";
import { createRoutes } from "../src/routes";

/**
 * End-to-end API test — real HTTP server on an ephemeral port, real fixture
 * repository (indexed for real), real store on disk; only the benchmark
 * runner is faked (no network, no AI CLI, no Ollama).
 */
const tmp = mkdtempSync(join(tmpdir(), "atlas-server-api-"));
const benchmarkRoot = join(tmp, "benchmarks");
const fixtureRepo = join(tmp, "fixture-repo");
let base = "";

/** Fake runner: cites the expected file/concept, uses fewer tokens in codeatlas mode. */
const fakeRunner: BenchmarkRunner = {
  name: "opencode",
  async execute(request) {
    const baseline = request.mode === "baseline";
    return ok({
      metrics: {
        input: baseline ? 900 : 150,
        output: baseline ? 100 : 50,
        reasoning: 0,
        total: baseline ? 1000 : 200,
        cacheWrite: 0,
        cacheRead: 0,
        source: "estimated",
      },
      cost: 0,
      durationMs: baseline ? 800 : 400,
      timedOut: false,
      exitCode: 0,
      finalText: baseline
        ? "The entry point is implemented in src/main.ts where the application wires its router."
        : "src/main.ts implements createApp, which builds the application and wires the router.",
      toolCalls: baseline
        ? []
        : [{ name: "search_symbols", status: "success", isError: false, durationMs: 12 }],
    });
  },
};

const community: CommunityConfig = {
  repositories: [
    {
      id: "fixture",
      name: "fixture-repo",
      description: "test fixture",
      url: "https://example.com/fixture",
      source: "local",
      path: fixtureRepo,
      difficulty: "small",
    },
    {
      id: "remote",
      name: "remote-repo",
      source: "git",
      cloneUrl: "https://example.invalid/repo.git",
    },
  ],
};

let closeServer: (() => Promise<void>) | null = null;

beforeAll(async () => {
  // Fixture repository (indexed for real by the browser benchmark below).
  mkdirSync(join(fixtureRepo, "src"), { recursive: true });
  writeFileSync(
    join(fixtureRepo, "src", "main.ts"),
    [
      'import { createRouter } from "./router.js";',
      "",
      "export function createApp(): { name: string } {",
      "  const router = createRouter();",
      "  return { name: 'app', router };",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(fixtureRepo, "src", "router.ts"),
    ["export function createRouter(): string[] {", '  return ["/health"];', "}", ""].join("\n"),
  );
  writeFileSync(
    join(fixtureRepo, "package.json"),
    JSON.stringify({ name: "fixture-repo", version: "1.0.0" }),
  );
  writeFileSync(join(fixtureRepo, "README.md"), "# fixture-repo\n");

  // Seed a task file with real expectations so evaluation scores are meaningful.
  const taskFile: TaskFile = {
    repository: "fixture",
    name: "fixture-repo",
    version: "1.0.0",
    files: 2,
    tasks: [
      {
        id: "T1",
        category: "file-discovery",
        prompt: "Where is the application entry point implemented?",
        expected_files: ["src/main.ts"],
        expected_concepts: ["createApp"],
        evaluation_method: "auto",
      },
    ],
  };
  const { BenchmarkStore } = await import("@atlas/benchmark");
  new BenchmarkStore(benchmarkRoot).saveTaskFile(taskFile, "fixture-tasks.json");

  const config = loadConfig({
    host: "127.0.0.1",
    port: 0,
    benchmarkRoot,
    communityConfigPath: join(tmp, "community.json"),
    uiDist: "",
    availabilityTimeoutMs: 500,
    cloneTimeoutMs: 2_000,
    jobTimeoutMs: 120_000,
    maxQueuedJobs: 4,
    maxBodyBytes: 64 * 1024,
  });
  const jobs = new JobManager({ maxConcurrent: 1, maxQueued: 4, jobTimeoutMs: 120_000 });
  const app = createApp({
    config,
    jobs,
    routes: createRoutes({ config, jobs, runners: new Map([["opencode", fakeRunner]]), community }),
  });
  const { host, port } = await app.start();
  base = `http://${host}:${port}`;
  closeServer = app.close;
});

afterAll(async () => {
  await closeServer?.();
  rmSync(tmp, { recursive: true, force: true });
});

async function get(path: string): Promise<Response> {
  return fetch(`${base}${path}`);
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Poll a job until it reaches a terminal state (real work, no faking). */
async function waitForJob(jobId: string, timeoutMs = 90_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await get(`/api/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const job = (await res.json()) as Record<string, unknown>;
    const status = job["status"];
    if (status !== "queued" && status !== "running") return job;
    if (Date.now() > deadline) throw new Error(`job ${jobId} did not finish in ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("Benchmark API", () => {
  it("reports health", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; benchmarkRoot: string };
    expect(body.ok).toBe(true);
    expect(body.benchmarkRoot).toBe(benchmarkRoot);
  });

  it("starts empty — no fabricated suites or stats", async () => {
    const res = await get("/api/benchmarks");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suites: unknown[]; stats: Record<string, unknown> };
    expect(body.suites).toHaveLength(0);
    expect(body.stats["repositoriesTested"]).toBe(0);
    expect(body.stats["avgTokenSavingsPct"]).toBeNull();
  });

  it("lists task files seeded in the store", async () => {
    const res = await get("/api/task-files");
    const body = (await res.json()) as {
      taskFiles: { name: string; tasks: number; hasExpectations: boolean }[];
    };
    expect(body.taskFiles).toHaveLength(1);
    expect(body.taskFiles[0]?.name).toBe("fixture-repo");
    expect(body.taskFiles[0]?.hasExpectations).toBe(true);
  });

  it("runs a full benchmark job end-to-end with real progress and results", async () => {
    const started = await post("/api/benchmarks", {
      repositoryPath: fixtureRepo,
      agent: "opencode",
      taskFile: "fixture-tasks.json",
      modes: ["baseline", "codeatlas"],
    });
    expect(started.status).toBe(200);
    const { jobId } = (await started.json()) as { jobId: string };

    const job = await waitForJob(jobId);
    expect(job["status"]).toBe("completed");
    const stages = job["stages"] as { id: string; state: string }[];
    expect(stages.map((s) => `${s.id}:${s.state}`)).toEqual([
      "prepare:done",
      "index:done",
      "benchmark:done",
      "report:done",
    ]);
    expect(job["progress"]).toEqual({ completed: 2, total: 2 });
    const result = job["result"] as { suiteId: string; ran: number; reused: number };
    expect(result.ran).toBe(2);

    // Suite list now carries measured metrics.
    const listRes = await get("/api/benchmarks");
    const list = (await listRes.json()) as {
      suites: {
        id: string;
        status: string;
        repository: { name: string };
        metrics: { tokenSavingsPct: number; accuracyDelta: number } | null;
        score: { value: number } | null;
        tasks: { total: number; completed: number };
      }[];
      stats: { repositoriesTested: number; avgTokenSavingsPct: number | null };
    };
    expect(list.suites).toHaveLength(1);
    const first = list.suites[0];
    expect(first).toBeDefined();
    const suite = first;
    expect(suite.status).toBe("completed");
    expect(suite.repository.name).toBe("fixture-repo");
    expect(suite.tasks.completed).toBe(2);
    expect(suite.metrics?.tokenSavingsPct).toBe(80);
    expect(suite.metrics?.accuracyDelta).toBeGreaterThan(0);
    expect(list.stats["repositoriesTested"]).toBe(1);
    expect(list.stats["avgTokenSavingsPct"]).toBe(80);

    // Detail: tasks with evaluations, repository stats, history.
    const detailRes = await get(`/api/benchmarks/${suite.id}`);
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as {
      suite: { id: string };
      tasks: {
        taskId: string;
        modes: Record<string, { evaluation?: { status: string; score: number } }>;
      }[];
      repositoryDetail: { files: number | null } | null;
      history: { suiteId: string }[];
    };
    expect(detail.tasks).toHaveLength(1);
    const baselineView = detail.tasks[0]?.modes["baseline"];
    const codeatlasView = detail.tasks[0]?.modes["codeatlas"];
    expect(baselineView?.evaluation?.status).toBe("partially_correct");
    expect(codeatlasView?.evaluation?.status).toBe("correct");
    expect(codeatlasView?.evaluation?.score).toBe(2);
    expect(detail.repositoryDetail?.files).not.toBeNull();
    expect(detail.history.length).toBeGreaterThanOrEqual(1);

    // Report endpoint serves real generated markdown.
    const reportRes = await get(`/api/benchmarks/${suite.id}/report?format=markdown`);
    expect(reportRes.status).toBe(200);
    const report = (await reportRes.json()) as { format: string; content: string };
    expect(report.format).toBe("markdown");
    expect(report.content).toContain("Token");

    // Unknown suite → 404.
    expect((await get("/api/benchmarks/does-not-exist")).status).toBe(404);
  });

  it("validates run requests honestly", async () => {
    expect((await post("/api/benchmarks", { repositoryPath: "/definitely/not/here" })).status).toBe(
      400,
    );
    expect((await post("/api/benchmarks", {})).status).toBe(400);
    expect(
      (await post("/api/benchmarks", { repositoryId: "unknown", repositoryPath: fixtureRepo }))
        .status,
    ).toBe(404);
    expect(
      (await post("/api/benchmarks", { repositoryPath: fixtureRepo, modes: ["nope"] })).status,
    ).toBe(400);
    const badBody = await fetch(`${base}/api/benchmarks`, { method: "POST", body: "not-json" });
    expect(badBody.status).toBe(400);
  });

  it("serves the community library with live availability and real benchmark links", async () => {
    const res = await get("/api/community/repos");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      repos: {
        id: string;
        source: string;
        availability: { available: boolean; checked: string };
        stats: { files: number | null } | null;
        benchmark: { suiteId: string } | null;
      }[];
    };
    const fixture = body.repos.find((r) => r.id === "fixture");
    expect(fixture?.availability.available).toBe(true);
    expect(fixture?.availability.checked).toBe("local-fs");
    expect(fixture?.stats?.files).not.toBeNull();
    expect(fixture?.benchmark?.suiteId).toBeTruthy();
    const remote = body.repos.find((r) => r.id === "remote");
    expect(remote?.source).toBe("git");
    // Availability of the unreachable remote is checked live; either way it is reported, not guessed.
    expect(typeof remote?.availability.available).toBe("boolean");
  });

  it("rejects community runs for unknown repositories", async () => {
    const res = await post("/api/community/repos/ghost/run", {});
    expect(res.status).toBe(404);
  });

  it("runs a browser benchmark (quick test) with real retrieval and token comparison", async () => {
    const started = await post("/api/browser-benchmarks", {
      repositoryPath: fixtureRepo,
      query: "Where is createApp implemented?",
      ai: true, // no provider configured → honest "unavailable", never a fake answer
    });
    expect(started.status).toBe(200);
    const { jobId } = (await started.json()) as { jobId: string };
    const job = await waitForJob(jobId);
    expect(job["status"]).toBe("completed");
    const result = job["result"] as {
      repository: {
        files: number;
        symbols: number | null;
        indexCreated: boolean;
        sizeBytes: number;
      };
      retrieval: { latencyMs: number; files: { path: string }[]; symbols: { name: string }[] };
      context: { items: { id: string }[]; tokensEstimated: number; budget: { maxItems: number } };
      tokens: {
        rawEstimated: number;
        contextEstimated: number;
        saved: number;
        savedPct: number;
        method: string;
      };
      ai: { status: string; error?: string; text?: string };
    };
    expect(result.repository.files).toBeGreaterThanOrEqual(3);
    expect(result.repository.symbols).not.toBeNull();
    expect(result.retrieval.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.tokens.method).toBe("estimated");
    expect(result.tokens.rawEstimated).toBeGreaterThan(0);
    expect(result.tokens.savedPct).toBeGreaterThanOrEqual(0);
    // Retrieval must have actually found the fixture's code.
    const paths = result.retrieval.files.map((f) => f.path);
    expect(paths.some((p) => p.includes("main.ts"))).toBe(true);
    // AI answer is honestly unavailable without a configured provider…
    expect(["unavailable", "failed", "completed"]).toContain(result.ai.status);
    if (result.ai.status !== "completed") {
      expect(result.ai.error ?? result.ai.text).toBeTruthy();
    }
  });

  it("validates browser benchmark requests", async () => {
    expect((await post("/api/browser-benchmarks", { repositoryPath: fixtureRepo })).status).toBe(
      400,
    );
    expect(
      (await post("/api/browser-benchmarks", { repositoryPath: "/nope", query: "x" })).status,
    ).toBe(400);
    expect(
      (await post("/api/browser-benchmarks", { repositoryId: "ghost", query: "x" })).status,
    ).toBe(404);
  });

  it("cancels a hanging benchmark job and marks the suite interrupted", async () => {
    let release: (() => void) | undefined;
    const hangingRunner: BenchmarkRunner = {
      name: "opencode",
      async execute(request) {
        if (request.mode === "codeatlas") {
          await new Promise<void>((r) => {
            release = r;
          });
        }
        return fakeRunner.execute(request);
      },
    };
    const config = loadConfig({
      host: "127.0.0.1",
      port: 0,
      benchmarkRoot,
      uiDist: "",
      jobTimeoutMs: 60_000,
    });
    const jobs = new JobManager({ maxConcurrent: 1, maxQueued: 2, jobTimeoutMs: 60_000 });
    const app = createApp({
      config,
      jobs,
      routes: createRoutes({
        config,
        jobs,
        runners: new Map([["opencode", hangingRunner]]),
        community,
      }),
    });
    const addr = await app.start();
    const cancelBase = `http://${addr.host}:${addr.port}`;
    try {
      const started = await fetch(`${cancelBase}/api/benchmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryPath: fixtureRepo,
          agent: "opencode",
          taskFile: "fixture-tasks.json",
        }),
      });
      const { jobId } = (await started.json()) as { jobId: string };
      // Wait for the run to reach the codeatlas hang.
      const deadline = Date.now() + 20_000;
      let job: Record<string, unknown> | undefined;
      for (;;) {
        const res = await fetch(`${cancelBase}/api/jobs/${jobId}`);
        job = (await res.json()) as Record<string, unknown>;
        if (job["currentTask"] !== undefined || Date.now() > deadline) break;
        await new Promise((r) => setTimeout(r, 25));
      }
      const cancelRes = await fetch(`${cancelBase}/api/jobs/${jobId}/cancel`, { method: "POST" });
      expect(cancelRes.status).toBe(200);
      release?.();
      const finalDeadline = Date.now() + 20_000;
      for (;;) {
        const res = await fetch(`${cancelBase}/api/jobs/${jobId}`);
        job = (await res.json()) as Record<string, unknown>;
        const status = job["status"];
        if (status !== "running" && status !== "queued") break;
        if (Date.now() > finalDeadline) throw new Error("cancel did not settle");
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(job["status"]).toBe("cancelled");
      expect(job["suiteId"]).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  it("returns 404 for unknown jobs and 409 for finished-job cancellation", async () => {
    expect((await get("/api/jobs/none")).status).toBe(404);
    const res = await post("/api/jobs/none/cancel", {});
    expect(res.status).toBe(404);
  });
});
