import { AgentCliNotFoundError } from "@atlas/agents";
import type {
  ContextScope,
  RoleResult,
  Session,
  SessionCreateRequest,
  SessionLaunchRequest,
  SessionOutput,
  SessionPort,
  TaskPlan,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { describe, expect, it, vi } from "vitest";
import {
  type ContextIntegration,
  type ContextPackage,
  MAX_PLAN_ROLES,
  type Orchestrator,
  PlanValidationError,
  buildPlan,
  combineResults,
  createOrchestrator,
  detectConflicts,
  renderCombinedReport,
  reviewPlan,
} from "../src/index";

const ROLE_TASK = {
  architecture: "Analyze the architecture of the auth module",
  security: "Review the security of the auth module",
};

/** A minimal, valid context package fixture. */
function makeContextPackage(task: string): ContextPackage {
  return {
    task,
    items: [
      {
        id: "file:/src/auth.ts",
        kind: "file",
        title: "/src/auth.ts",
        path: "/src/auth.ts",
        content: "export const authenticate = () => true;",
        score: 1,
        source: "search",
        reason: "test fixture",
        truncated: false,
        tokens: 8,
      },
    ],
    staleness: {
      state: "unavailable",
      available: false,
      lastUpdated: "",
      changed: [],
      added: [],
      deleted: [],
    },
    budget: {
      budget: { maxItems: 20, maxTokensPerItem: 2000, maxTokensTotal: 12000 },
      itemsRequested: 1,
      itemsIncluded: 1,
      tokensEstimated: 8,
      itemsDroppedByCount: [],
      itemsTruncated: [],
      droppedByTokens: [],
      budgetExceeded: false,
    },
    exclusions: { droppedPaths: [], droppedPatterns: [] },
  };
}

interface FakeSessions {
  readonly port: SessionPort;
  /** Every startSession call, in order. */
  readonly records: Array<{ sessionId: string; launch: SessionLaunchRequest | undefined }>;
  /** Session ids that were force-terminated. */
  readonly terminated: string[];
  /** Session ids that were gracefully stopped. */
  readonly stopped: string[];
  shutdownCalls: number;
  /** Move a session into a terminal state (with the given exit code). */
  complete(sessionId: string, status: "STOPPED" | "FAILED", exitCode?: number | null): void;
  /** Record output for a session (as if the child had written it). */
  setOutput(sessionId: string, output: SessionOutput): void;
  /** Queue launch failures (one consumed per startSession call). */
  failStartWith(error: Error): void;
  getSession(sessionId: string): Session | undefined;
}

function createFakeSessions(): FakeSessions {
  let nextId = 0;
  const sessions = new Map<string, Session>();
  const outputs = new Map<string, SessionOutput>();
  const records: FakeSessions["records"] = [];
  const terminated: string[] = [];
  const stopped: string[] = [];
  const startErrors: Error[] = [];
  let shutdownCalls = 0;

  const port: SessionPort = {
    createSession(request: SessionCreateRequest): Result<Session> {
      const session: Session = {
        id: `s${nextId++}`,
        agentId: `agent-${request.provider}` as Session["agentId"],
        provider: request.provider,
        repositoryPath: request.repositoryPath,
        status: "CREATED",
        processId: undefined,
        startedAt: undefined,
        endedAt: undefined,
        exitCode: undefined,
        error: undefined,
        model: undefined,
        tokenUsage: undefined,
      };
      sessions.set(session.id, session);
      return ok(session);
    },
    async startSession(id: string, launch?: SessionLaunchRequest): Promise<Result<Session>> {
      const error = startErrors.shift();
      if (error !== undefined) {
        return fail(error);
      }
      const session = sessions.get(id);
      if (session === undefined) {
        return fail(new Error(`unknown session ${id}`));
      }
      records.push({ sessionId: id, launch });
      const running: Session = { ...session, status: "RUNNING", startedAt: 1 };
      sessions.set(id, running);
      return ok(running);
    },
    getSession(id: string): Session | undefined {
      return sessions.get(id);
    },
    listSessions(): readonly Session[] {
      return [...sessions.values()];
    },
    getActiveSessions(): readonly Session[] {
      return [...sessions.values()].filter((s) => s.status !== "STOPPED" && s.status !== "FAILED");
    },
    getSessionOutput(id: string): SessionOutput | undefined {
      return outputs.get(id);
    },
    async stopSession(id: string): Promise<Result<Session>> {
      const session = sessions.get(id);
      if (session === undefined) {
        return fail(new Error(`unknown session ${id}`));
      }
      stopped.push(id);
      const terminal: Session = { ...session, status: "STOPPED", endedAt: 2, exitCode: 0 };
      sessions.set(id, terminal);
      return ok(terminal);
    },
    async terminateSession(id: string): Promise<Result<Session>> {
      const session = sessions.get(id);
      if (session === undefined) {
        return fail(new Error(`unknown session ${id}`));
      }
      terminated.push(id);
      const terminal: Session = { ...session, status: "STOPPED", endedAt: 2, exitCode: null };
      sessions.set(id, terminal);
      return ok(terminal);
    },
    async shutdown(): Promise<void> {
      shutdownCalls += 1;
    },
  };

  return {
    port,
    records,
    terminated,
    stopped,
    get shutdownCalls() {
      return shutdownCalls;
    },
    complete(sessionId: string, status: "STOPPED" | "FAILED", exitCode: number | null = null) {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        return;
      }
      sessions.set(sessionId, { ...session, status, endedAt: 2, exitCode });
    },
    setOutput(sessionId: string, output: SessionOutput) {
      outputs.set(sessionId, output);
    },
    failStartWith(error: Error) {
      startErrors.push(error);
    },
    getSession(sessionId: string): Session | undefined {
      return sessions.get(sessionId);
    },
  };
}

interface FakeIntegration {
  readonly port: ContextIntegration;
  /** Every buildPackage call, in order (per role attempt). */
  readonly buildInputs: Array<{ task: string; scopePaths: readonly string[] | undefined }>;
}

function createFakeIntegration(): FakeIntegration {
  const buildInputs: FakeIntegration["buildInputs"] = [];
  const port: ContextIntegration = {
    async buildPackage(input) {
      buildInputs.push({ task: input.task, scopePaths: input.scopePaths });
      return makeContextPackage(input.task);
    },
    async explain() {
      throw new Error("unused in orchestrator tests");
    },
    async buildSlice() {
      throw new Error("unused in orchestrator tests");
    },
    async launch() {
      return fail(new Error("unused in orchestrator tests"));
    },
    async attach() {
      return fail(new Error("unused in orchestrator tests"));
    },
    async brief() {
      return fail(new Error("unused in orchestrator tests"));
    },
    async review() {
      return fail(new Error("unused in orchestrator tests"));
    },
    getSessionOutput() {
      return undefined;
    },
  };
  return { port, buildInputs };
}

/** The session the executor started for a role's task. */
function sessionIdFor(fake: FakeSessions, task: string): string {
  const record = fake.records.find((r) => r.launch?.prompt?.startsWith(`# Task\n${task}`));
  if (record === undefined) {
    throw new Error(`no launch recorded for task "${task}"`);
  }
  return record.sessionId;
}

function makeOrchestrator(options: { maxRetries?: number } = {}): {
  orchestrator: Orchestrator;
  fake: FakeSessions;
  integration: FakeIntegration;
} {
  const fake = createFakeSessions();
  const integration = createFakeIntegration();
  const orchestrator = createOrchestrator({
    sessions: fake.port,
    integration: integration.port,
    pollIntervalMs: 5,
    ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
  });
  return { orchestrator, fake, integration };
}

describe("buildPlan", () => {
  it("defaults to parallel mode and a shared context scope", () => {
    const plan = buildPlan({
      task: "Review the auth module",
      repositoryPath: "/repo",
      roles: [
        { id: "arch", name: "Architecture", provider: "claude", task: ROLE_TASK.architecture },
        { id: "sec", name: "Security", provider: "gemini", task: ROLE_TASK.security },
      ],
    });

    expect(plan.mode).toBe("parallel");
    expect(plan.roles.map((r) => r.id)).toEqual(["arch", "sec"]);
    for (const role of plan.roles) {
      expect(role.contextScope).toEqual({ type: "shared" });
    }
  });

  it("rejects plans without roles, with duplicate ids, or over the cap", () => {
    expect(() => buildPlan({ task: "t", repositoryPath: "/repo", roles: [] })).toThrowError(
      PlanValidationError,
    );

    expect(() =>
      buildPlan({
        task: "t",
        repositoryPath: "/repo",
        roles: [
          { id: "a", name: "A", provider: "claude", task: "x" },
          { id: "a", name: "B", provider: "gemini", task: "y" },
        ],
      }),
    ).toThrowError(/duplicate role id/);

    const roles = Array.from({ length: MAX_PLAN_ROLES + 1 }, (_, i) => ({
      id: `r${i}`,
      name: `Role ${i}`,
      provider: "claude",
      task: `task ${i}`,
    }));
    expect(() => buildPlan({ task: "t", repositoryPath: "/repo", roles })).toThrowError(
      /at most 8 roles/,
    );
  });
});

describe("reviewPlan", () => {
  it("builds the parallel 3-role review scenario", () => {
    const plan = reviewPlan({
      task: "Review the authentication implementation",
      repositoryPath: "/repo",
      providers: { architecture: "claude", security: "gemini", implementation: "codex" },
    });

    expect(plan.mode).toBe("parallel");
    expect(plan.roles.map((r) => r.id)).toEqual(["architecture", "security", "implementation"]);
    expect(plan.roles.map((r) => r.provider)).toEqual(["claude", "gemini", "codex"]);
    for (const role of plan.roles) {
      expect(role.task).toContain("Review the authentication implementation");
    }
  });
});

describe("executePlan (parallel)", () => {
  it("runs every role, captures output, and reports succeeded results", async () => {
    const { orchestrator, fake } = makeOrchestrator();
    const plan = buildPlan({
      task: "Review the auth module",
      repositoryPath: "/repo",
      roles: [
        { id: "arch", name: "Architecture", provider: "claude", task: ROLE_TASK.architecture },
        { id: "sec", name: "Security", provider: "gemini", task: ROLE_TASK.security },
      ],
    });

    const runPromise = orchestrator.orchestrate(plan);
    await vi.waitFor(() => expect(fake.records).toHaveLength(2));

    const arch = sessionIdFor(fake, ROLE_TASK.architecture);
    const sec = sessionIdFor(fake, ROLE_TASK.security);
    fake.setOutput(arch, { stdout: "Layered modules; low coupling.\n", stderr: "" });
    fake.complete(arch, "STOPPED", 0);
    fake.setOutput(sec, { stdout: "No vulnerabilities found.\n", stderr: "" });
    fake.complete(sec, "STOPPED", 0);

    const run = await runPromise;

    expect(run.status).toBe("succeeded");
    expect(run.results.map((r) => [r.role.id, r.status])).toEqual([
      ["arch", "succeeded"],
      ["sec", "succeeded"],
    ]);
    expect(run.results[0]?.stdout).toBe("Layered modules; low coupling.\n");
    expect(run.results[1]?.stdout).toBe("No vulnerabilities found.\n");
    // Every role's session captured output.
    for (const record of fake.records) {
      expect(record.launch?.captureOutput).toBe(true);
    }
    // No orphan children after the run.
    expect(fake.port.getActiveSessions()).toHaveLength(0);
  });

  it("assembles an isolated context scope per role", async () => {
    const { orchestrator, fake, integration } = makeOrchestrator();
    const plan = buildPlan({
      task: "Review the auth module",
      repositoryPath: "/repo",
      roles: [
        {
          id: "arch",
          name: "Architecture",
          provider: "claude",
          task: ROLE_TASK.architecture,
          contextScope: { type: "isolated", paths: ["packages/auth/src"] } satisfies ContextScope,
        },
        { id: "sec", name: "Security", provider: "gemini", task: ROLE_TASK.security },
      ],
    });

    const runPromise = orchestrator.orchestrate(plan);
    await vi.waitFor(() => expect(fake.records).toHaveLength(2));
    for (const record of fake.records) {
      fake.complete(record.sessionId, "STOPPED", 0);
    }
    await runPromise;

    const byTask = new Map(integration.buildInputs.map((input) => [input.task, input]));
    expect(byTask.get(ROLE_TASK.architecture)?.scopePaths).toEqual(["packages/auth/src"]);
    expect(byTask.get(ROLE_TASK.security)?.scopePaths).toBeUndefined();
  });

  it("times out a hanging role, terminates it, and reports its partial output", async () => {
    const { orchestrator, fake } = makeOrchestrator();
    const plan = buildPlan({
      task: "Review the auth module",
      repositoryPath: "/repo",
      roles: [
        {
          id: "slow",
          name: "Slow role",
          provider: "claude",
          task: ROLE_TASK.architecture,
          timeoutMs: 20,
        },
      ],
    });

    const runPromise = orchestrator.orchestrate(plan);
    await vi.waitFor(() => expect(fake.records).toHaveLength(1), { interval: 5 });
    const slow = sessionIdFor(fake, ROLE_TASK.architecture);
    fake.setOutput(slow, { stdout: "partial findings", stderr: "" });
    // The session stays RUNNING past the deadline.
    await vi.waitFor(() => expect(fake.terminated).toContain(slow), { interval: 5 });

    const run = await runPromise;

    expect(run.results[0]?.status).toBe("timed-out");
    expect(run.results[0]?.stdout).toBe("partial findings");
    expect(run.results[0]?.timedOut).toBe(true);
    expect(run.status).toBe("failed");
    expect(fake.port.getActiveSessions()).toHaveLength(0);
  });
});

describe("executePlan (sequential)", () => {
  it("feeds earlier findings into later role prompts", async () => {
    const { orchestrator, fake } = makeOrchestrator();
    const plan = buildPlan({
      task: "Review the auth module",
      repositoryPath: "/repo",
      mode: "sequential",
      roles: [
        { id: "arch", name: "Architecture", provider: "claude", task: ROLE_TASK.architecture },
        { id: "sec", name: "Security", provider: "gemini", task: ROLE_TASK.security },
      ],
    });

    const runPromise = orchestrator.orchestrate(plan);
    // The second role only starts after the first completes.
    await vi.waitFor(() => expect(fake.records).toHaveLength(1));
    const arch = sessionIdFor(fake, ROLE_TASK.architecture);
    fake.setOutput(arch, { stdout: "The auth module uses a layered design.\n", stderr: "" });
    fake.complete(arch, "STOPPED", 0);

    await vi.waitFor(() => expect(fake.records).toHaveLength(2));
    const sec = sessionIdFor(fake, ROLE_TASK.security);
    const secPrompt = fake.records[1]?.launch?.prompt ?? "";
    expect(secPrompt).toContain("# Findings from earlier roles (Security)");
    expect(secPrompt).toContain("The auth module uses a layered design.");
    fake.complete(sec, "STOPPED", 0);

    const run = await runPromise;

    expect(run.status).toBe("succeeded");
    expect(run.results.map((r) => r.role.id)).toEqual(["arch", "sec"]);
  });
});

describe("retries, failures, and cancellation", () => {
  it("retries retryable launch failures up to the cap, then succeeds", async () => {
    const { orchestrator, fake } = makeOrchestrator({ maxRetries: 2 });
    const plan = buildPlan({
      task: "Review the auth module",
      repositoryPath: "/repo",
      roles: [
        { id: "arch", name: "Architecture", provider: "claude", task: ROLE_TASK.architecture },
      ],
    });
    fake.failStartWith(new AgentCliNotFoundError("claude", "claude"));
    fake.failStartWith(new AgentCliNotFoundError("claude", "claude"));

    const runPromise = orchestrator.orchestrate(plan);
    // Wait until a session actually started (third attempt).
    await vi.waitFor(() => expect(fake.records).toHaveLength(1));
    const arch = sessionIdFor(fake, ROLE_TASK.architecture);
    fake.complete(arch, "STOPPED", 0);

    const run = await runPromise;

    expect(run.results[0]?.status).toBe("succeeded");
    expect(run.results[0]?.retries).toBe(2);
  });

  it("gives up after the retry cap is exceeded", async () => {
    const { orchestrator, fake } = makeOrchestrator({ maxRetries: 1 });
    const plan = buildPlan({
      task: "Review the auth module",
      repositoryPath: "/repo",
      roles: [
        { id: "arch", name: "Architecture", provider: "claude", task: ROLE_TASK.architecture },
      ],
    });
    fake.failStartWith(new AgentCliNotFoundError("claude", "claude"));
    fake.failStartWith(new AgentCliNotFoundError("claude", "claude"));

    const run = await orchestrator.orchestrate(plan);

    expect(run.status).toBe("failed");
    expect(run.results[0]?.status).toBe("failed");
    expect(run.results[0]?.retries).toBe(1);
    expect(run.results[0]?.error).toContain("could not be found");
  });

  it("cancels the remaining roles when one role fails", async () => {
    const { orchestrator, fake } = makeOrchestrator();
    const plan = buildPlan({
      task: "Review the auth module",
      repositoryPath: "/repo",
      roles: [
        { id: "arch", name: "Architecture", provider: "claude", task: ROLE_TASK.architecture },
        { id: "sec", name: "Security", provider: "gemini", task: ROLE_TASK.security },
      ],
    });

    const runPromise = orchestrator.orchestrate(plan);
    await vi.waitFor(() => expect(fake.records).toHaveLength(2));
    const arch = sessionIdFor(fake, ROLE_TASK.architecture);
    const sec = sessionIdFor(fake, ROLE_TASK.security);
    fake.complete(arch, "FAILED", 1);

    const run = await runPromise;

    expect(run.status).toBe("failed");
    const byRole = new Map(run.results.map((r) => [r.role.id, r.status]));
    expect(byRole.get("arch")).toBe("failed");
    expect(byRole.get("sec")).toBe("cancelled");
    // The in-flight sibling was terminated, never left orphaned.
    expect(fake.terminated).toContain(sec);
    expect(fake.port.getActiveSessions()).toHaveLength(0);
  });

  it("cancels a running run on user cancellation and cleans up", async () => {
    const { orchestrator, fake } = makeOrchestrator();
    const plan = buildPlan({
      task: "Review the auth module",
      repositoryPath: "/repo",
      roles: [
        { id: "arch", name: "Architecture", provider: "claude", task: ROLE_TASK.architecture },
        { id: "sec", name: "Security", provider: "gemini", task: ROLE_TASK.security },
      ],
    });

    const runPromise = orchestrator.orchestrate(plan);
    await vi.waitFor(() => expect(fake.records).toHaveLength(2));
    await orchestrator.cancel();

    const run = await runPromise;

    expect(run.status).toBe("cancelled");
    expect(run.results.map((r) => r.status)).toEqual(["cancelled", "cancelled"]);
    expect(fake.port.getActiveSessions()).toHaveLength(0);
  });

  it("exposes a live run view via getRun", async () => {
    const { orchestrator, fake } = makeOrchestrator();
    const plan = buildPlan({
      task: "Review the auth module",
      repositoryPath: "/repo",
      mode: "sequential",
      roles: [
        { id: "arch", name: "Architecture", provider: "claude", task: ROLE_TASK.architecture },
        { id: "sec", name: "Security", provider: "gemini", task: ROLE_TASK.security },
      ],
    });

    const runPromise = orchestrator.orchestrate(plan);
    await vi.waitFor(() => expect(fake.records).toHaveLength(1));
    const arch = sessionIdFor(fake, ROLE_TASK.architecture);
    fake.setOutput(arch, { stdout: "done first", stderr: "" });
    fake.complete(arch, "STOPPED", 0);

    // The run is still in flight, but the first role's result is already visible.
    await vi.waitFor(() => expect(orchestrator.getRun()?.results.length).toBeGreaterThan(0));
    expect(orchestrator.getRun()?.status).toBe("running");

    const sec = sessionIdFor(fake, ROLE_TASK.security);
    fake.complete(sec, "STOPPED", 0);
    const run = await runPromise;
    expect(orchestrator.getRun(plan.id)?.status).toBe(run.status);
  });
});

describe("combine", () => {
  function resultWith(
    role: { id: string; name: string; provider: string },
    stdout: string,
    status: RoleResult["status"] = "succeeded",
  ): RoleResult {
    return {
      role: {
        id: role.id,
        name: role.name,
        provider: role.provider,
        task: "t",
        contextScope: { type: "shared" },
      },
      sessionId: `s-${role.id}`,
      status,
      exitCode: status === "succeeded" ? 0 : 1,
      error: undefined,
      stdout,
      stderr: "",
      timedOut: false,
      retries: 0,
      startedAt: 1,
      endedAt: 2,
    };
  }

  it("attributes every section and renders an honest report", () => {
    const report = combineResults([
      resultWith({ id: "arch", name: "Architecture", provider: "claude" }, "Layered modules."),
      resultWith({ id: "sec", name: "Security", provider: "gemini" }, "No issues found."),
    ]);

    expect(report.sections.map((s) => [s.roleName, s.provider, s.status])).toEqual([
      ["Architecture", "claude", "succeeded"],
      ["Security", "gemini", "succeeded"],
    ]);
    const text = renderCombinedReport(report);
    expect(text).toContain("## 1. Architecture (claude) — succeeded");
    expect(text).toContain("No obvious conflicts between roles.");
  });

  it("surfaces an obvious disagreement between roles", () => {
    const report = combineResults([
      resultWith(
        { id: "sec", name: "Security", provider: "gemini" },
        "The AuthService is vulnerable.",
      ),
      resultWith(
        { id: "impl", name: "Implementation", provider: "codex" },
        "The AuthService is secure.",
      ),
    ]);

    expect(report.conflicts.some((c) => c.topic === "AuthService")).toBe(true);
    const conflict = report.conflicts.find((c) => c.topic === "AuthService");
    expect(conflict?.roleIds).toEqual(expect.arrayContaining(["sec", "impl"]));
    expect(conflict?.roleIds).toHaveLength(2);
    expect(renderCombinedReport(report)).toContain('disagree about "AuthService"');
  });

  it("ignores failed/timed-out roles when detecting conflicts", () => {
    const conflicts = detectConflicts([
      resultWith(
        { id: "sec", name: "Security", provider: "gemini" },
        "The AuthService is vulnerable.",
      ),
      resultWith(
        { id: "impl", name: "Implementation", provider: "codex" },
        "The AuthService is secure.",
        "failed",
      ),
    ]);

    expect(conflicts).toHaveLength(0);
  });
});

describe("plan validation edge cases", () => {
  it("builds a plan from an explicit reviewPlan input", () => {
    const plan: TaskPlan = reviewPlan({
      task: "Audit the payment flow",
      repositoryPath: "/repo",
      providers: { architecture: "opencode", security: "claude", implementation: "gemini" },
      timeoutMs: 30_000,
    });

    expect(plan.mode).toBe("parallel");
    for (const role of plan.roles) {
      expect(role.timeoutMs).toBe(30_000);
    }
  });
});
