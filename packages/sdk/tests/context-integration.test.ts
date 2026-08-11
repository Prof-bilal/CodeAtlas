import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ContextData, Session, SessionPort, SourceFile, Summary, Symbol } from "@atlas/core";
import { ok, type FilePath, type NodeId, type SymbolId } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { SessionStateError } from "@atlas/agents";
import {
  createContextSDK,
  createContextIntegration,
  applyBudget,
  DEFAULT_CONTEXT_BUDGET,
  estimateTokens,
  denyFilter,
  renderContextPackage,
  renderContextExplanation,
  toContextExplanation,
  ContextAttachUnsupportedError,
  InvalidQueryError,
  type ContextPackage,
  type ContextPackageItem,
  type ContextSDK,
} from "../src/index";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function fixtureFile(path: string, content: string, language = "typescript"): SourceFile {
  return { path: path as FilePath, language, content };
}

function fixtureSymbol(
  id: string,
  name: string,
  filePath: string,
  kind: Symbol["kind"] = "function",
): Symbol {
  return {
    id: id as SymbolId,
    name,
    kind,
    filePath: filePath as FilePath,
    location: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 4 },
    parentId: null,
    visibility: "exported",
    exported: true,
    modifiers: ["export"],
    moduleSpecifier: null,
    typeText: null,
    documentation: `Documentation for ${name}.`,
  };
}

function fixtureSummary(
  kind: Summary["kind"],
  target: string,
  overview: string,
  keyPoints: readonly string[],
): Summary {
  return {
    kind,
    target,
    content: { overview, keyPoints },
    metadata: {
      generatedAt: "2026-08-09T00:00:00.000Z",
      provider: "claude",
      model: "claude-sonnet-5",
      prompt: null,
      cacheHit: false,
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  };
}

/** A temp repository directory (for instruction files), cleaned up after tests. */
function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-integration-"));
  tempDirs.push(dir);
  return dir;
}

/** An SDK over an in-memory store pointing at `repositoryPath`, populated with data. */
async function withSdk(
  repositoryPath: string,
  data: ContextData,
  fn: (sdk: ContextSDK) => void | Promise<void>,
): Promise<void> {
  const sdk = createContextSDK({
    contextDb: new ContextStore({ filePath: ":memory:" }),
    repositoryPath,
  });
  sdk.write.save(data);
  try {
    await fn(sdk);
  } finally {
    sdk.close();
  }
}

/** The standard two-file project used across SDK tests. */
function standardData(overrides: Partial<ContextData> = {}): ContextData {
  return {
    files: [
      fixtureFile("/src/math.ts", "export function double(n: number) { return n * 2; }"),
      fixtureFile(
        "/src/auth.ts",
        "import { double } from './math';\nexport function login() { return double(2); }",
      ),
      fixtureFile("/README.md", "# Demo project", "markdown"),
    ],
    symbols: [
      fixtureSymbol("s1", "double", "/src/math.ts", "function"),
      fixtureSymbol("s2", "login", "/src/auth.ts", "function"),
      fixtureSymbol("s3", "MathUtils", "/src/math.ts", "class"),
    ],
    dependencies: [
      { from: "n:s2" as NodeId, to: "n:s1" as NodeId, kind: "calls" },
      {
        from: "n:file:/src/auth.ts" as NodeId,
        to: "n:file:/src/math.ts" as NodeId,
        kind: "imports",
      },
    ],
    modules: [{ path: "/src", name: "src", moduleType: "folder" }],
    summaries: [
      fixtureSummary("file", "/src/math.ts", "Math utilities for the project.", ["double"]),
      fixtureSummary("module", "/src", "The src module holds math and auth.", ["math", "auth"]),
      fixtureSummary("project", "", "CodeAtlas demo project.", ["math", "auth", "readme"]),
    ],
    ...overrides,
  };
}

describe("estimateTokens / applyBudget", () => {
  it("estimates one token per four characters", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });

  it("truncates oversized items and records the truncation", () => {
    const item = {
      id: "file:big.ts",
      kind: "file" as const,
      title: "big.ts",
      path: "big.ts",
      content: "x".repeat(400),
      score: 10,
      source: "search" as const,
      reason: "hit",
      truncated: false,
      tokens: 100,
    };
    const { items, record } = applyBudget([item], {
      maxItems: 10,
      maxTokensPerItem: 10,
      maxTokensTotal: 1000,
    });
    expect(items[0]?.truncated).toBe(true);
    expect(record.itemsTruncated).toEqual(["file:big.ts"]);
    expect(items[0]?.content).toContain("[truncated]");
    expect(items[0]?.tokens).toBeLessThan(100);
  });

  it("drops the tail to fit the total token cap, never instructions", () => {
    const make = (
      id: string,
      kind: "instructions" | "file",
      tokens: number,
    ): ContextPackageItem => ({
      id,
      kind,
      title: id,
      path: null,
      content: "y".repeat(tokens * 4),
      score: kind === "instructions" ? 0 : 1,
      source: kind === "instructions" ? "instructions" : "search",
      reason: "",
      truncated: false,
      tokens,
    });
    const items = [
      make("instructions:AGENTS.md", "instructions", 5000),
      make("file:a.ts", "file", 4000),
      make("file:b.ts", "file", 4000),
    ];
    const { items: kept, record } = applyBudget(items, {
      maxItems: 10,
      maxTokensPerItem: 100000,
      maxTokensTotal: 9000,
    });
    expect(kept.map((i) => i.id)).toEqual(["instructions:AGENTS.md", "file:a.ts"]);
    expect(record.droppedByTokens).toEqual(["file:b.ts"]);
    expect(record.budgetExceeded).toBe(false);
  });

  it("reports budgetExceeded when essentials alone overflow", () => {
    const item = {
      id: "instructions:AGENTS.md",
      kind: "instructions" as const,
      title: "AGENTS.md",
      path: null,
      content: "z".repeat(40000),
      score: 0,
      source: "instructions" as const,
      reason: "",
      truncated: false,
      tokens: 10000,
    };
    const { record } = applyBudget([item], {
      ...DEFAULT_CONTEXT_BUDGET,
      maxTokensPerItem: 50000,
      maxTokensTotal: 5000,
    });
    expect(record.budgetExceeded).toBe(true);
    expect(record.itemsIncluded).toBe(1);
  });
});

describe("denyFilter", () => {
  it("drops .env files by path", () => {
    const result = denyFilter("/src/.env.local", "DATABASE_URL=postgres://localhost");
    expect(result.accepted).toBe(false);
    expect(result.pathPatterns).toContain(".env*");
  });

  it("drops files containing a high-confidence credential", () => {
    const result = denyFilter(
      "/src/aws.env",
      "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nSECRET=whatever",
    );
    expect(result.accepted).toBe(false);
    expect(result.contentPatterns).toContain("AWS access key");
  });

  it("tolerates placeholder credential examples in docs", () => {
    const result = denyFilter(
      "/README.md",
      "Set API_KEY=your-key-here before running.\nclient_secret: <example>",
    );
    expect(result.accepted).toBe(true);
  });

  it("accepts ordinary source files", () => {
    expect(denyFilter("/src/math.ts", "export const n = 2;").accepted).toBe(true);
  });
});

describe("assembleContextPackage (via buildPackage)", () => {
  it("assembles a package with instructions, overview, and ranked items", async () => {
    const repo = tempRepo();
    writeFileSync(join(repo, "AGENTS.md"), "# Rules\nNever commit secrets.\n");
    await withSdk(repo, standardData(), async (sdk) => {
      const integration = createContextIntegration({ context: sdk, sessions: fakeSessions().port });
      const pkg = await integration.buildPackage({ task: "double" });

      expect(pkg.items[0]?.kind).toBe("instructions");
      expect(pkg.items.some((i) => i.kind === "overview")).toBe(true);
      expect(pkg.items.some((i) => i.kind === "file")).toBe(true);
      expect(pkg.items.some((i) => i.kind === "symbol")).toBe(true);
      expect(pkg.items.some((i) => i.kind === "dependency")).toBe(true);
      expect(pkg.items.some((i) => i.kind === "summary")).toBe(true);
      expect(pkg.staleness.state).toBe("unknown");
      expect(pkg.staleness.available).toBe(true);
      for (const item of pkg.items) {
        expect(item.reason.length).toBeGreaterThan(0);
      }
    });
  });

  it("includes each summary exactly once (no project-summary duplication)", async () => {
    const repo = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const integration = createContextIntegration({ context: sdk, sessions: fakeSessions().port });
      const pkg = await integration.buildPackage({ task: "math" });
      const projectSummaries = pkg.items.filter(
        (i) => i.kind === "summary" && i.title === "project",
      );
      expect(projectSummaries).toHaveLength(1);
    });
  });

  it("drops secret-bearing files and records the exclusion", async () => {
    const repo = tempRepo();
    const data = standardData({
      files: [
        ...(standardData().files ?? []),
        fixtureFile("/src/aws.env", "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"),
      ],
    });
    await withSdk(repo, data, async (sdk) => {
      const integration = createContextIntegration({ context: sdk, sessions: fakeSessions().port });
      const pkg = await integration.buildPackage({ task: "aws" });

      expect(pkg.items.some((i) => i.path === "/src/aws.env")).toBe(false);
      expect(pkg.exclusions.droppedPaths).toContain("/src/aws.env");
      expect(pkg.exclusions.droppedPatterns).toContain("AWS access key");
    });
  });

  it("honours includeInstructions / includeOverview flags", async () => {
    const repo = tempRepo();
    writeFileSync(join(repo, "AGENTS.md"), "# Rules\n");
    await withSdk(repo, standardData(), async (sdk) => {
      const integration = createContextIntegration({ context: sdk, sessions: fakeSessions().port });
      const pkg = await integration.buildPackage({
        task: "double",
        includeInstructions: false,
        includeOverview: false,
      });
      expect(pkg.items.some((i) => i.kind === "instructions")).toBe(false);
      expect(pkg.items.some((i) => i.kind === "overview")).toBe(false);
      expect(pkg.items.length).toBeGreaterThan(0);
    });
  });

  it("enforces the token budget and records drops", async () => {
    const repo = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const integration = createContextIntegration({ context: sdk, sessions: fakeSessions().port });
      const pkg = await integration.buildPackage({
        task: "double",
        budget: { maxTokensTotal: 600, maxTokensPerItem: 300 },
      });
      expect(pkg.budget.tokensEstimated).toBeLessThanOrEqual(600);
      expect(pkg.budget.itemsIncluded).toBeGreaterThan(0);
      expect(pkg.budget.budgetExceeded).toBe(false);
    });
  });

  it("reports an unavailable index honestly", async () => {
    const repo = tempRepo();
    const sdk = createContextSDK({ repositoryPath: repo });
    try {
      const integration = createContextIntegration({ context: sdk, sessions: fakeSessions().port });
      const pkg = await integration.buildPackage({ task: "anything" });
      expect(pkg.staleness.state).toBe("unavailable");
      expect(pkg.items).toEqual([]);
    } finally {
      sdk.close();
    }
  });

  it("rejects an empty task", async () => {
    const repo = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const integration = createContextIntegration({ context: sdk, sessions: fakeSessions().port });
      await expect(integration.buildPackage({ task: "   " })).rejects.toBeInstanceOf(
        InvalidQueryError,
      );
    });
  });
});

describe("render helpers", () => {
  function samplePackage(): ContextPackage {
    return {
      task: "double",
      items: [
        {
          id: "file:/src/math.ts",
          kind: "file",
          title: "/src/math.ts",
          path: "/src/math.ts",
          content: "export function double(n: number) { return n * 2; }",
          score: 9,
          source: "search",
          reason: "Ranked search hit.",
          truncated: false,
          tokens: 8,
        },
      ],
      staleness: {
        state: "fresh",
        available: true,
        lastUpdated: "2026-08-11T00:00:00.000Z",
        changed: [],
        added: [],
        deleted: [],
      },
      budget: {
        budget: DEFAULT_CONTEXT_BUDGET,
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

  it("renders a full prompt with task, content, and budget", () => {
    const text = renderContextPackage(samplePackage());
    expect(text).toContain("# Task");
    expect(text).toContain("double");
    expect(text).toContain("export function double");
    expect(text).toContain("Ranked search hit.");
    expect(text).toContain("fresh");
  });

  it("renders a content-free explanation and preserves reasons", () => {
    const explanation = toContextExplanation(samplePackage());
    const text = renderContextExplanation(explanation);
    expect(text).toContain("Ranked search hit.");
    expect(text).not.toContain("export function double");
  });
});

describe("createContextIntegration — delivery", () => {
  it("launches a session seeded with the rendered package", async () => {
    const repo = tempRepo();
    const sessions = fakeSessions();
    await withSdk(repo, standardData(), async (sdk) => {
      const integration = createContextIntegration({ context: sdk, sessions: sessions.port });
      const result = await integration.launch({
        provider: "claude",
        repositoryPath: repo,
        task: "double",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.status).toBe("RUNNING");
      expect(sessions.launchPrompts.length).toBe(1);
      expect(sessions.launchPrompts[0]).toContain("export function double");
    });
  });

  it("attaches to a CREATED session", async () => {
    const repo = tempRepo();
    const sessions = fakeSessions();
    const created = sessions.port.createSession({ provider: "claude", repositoryPath: repo });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    await withSdk(repo, standardData(), async (sdk) => {
      const integration = createContextIntegration({ context: sdk, sessions: sessions.port });
      const result = await integration.attach({ sessionId: created.value.id, task: "double" });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.status).toBe("RUNNING");
    });
  });

  it("reports a typed error when attaching to a live session", async () => {
    const repo = tempRepo();
    const sessions = fakeSessions({ running: true });
    const created = sessions.port.createSession({ provider: "claude", repositoryPath: repo });
    if (!created.ok) {
      return;
    }
    await withSdk(repo, standardData(), async (sdk) => {
      const integration = createContextIntegration({ context: sdk, sessions: sessions.port });
      const result = await integration.attach({ sessionId: created.value.id, task: "double" });
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(ContextAttachUnsupportedError);
    });
  });

  it("fails cleanly for an unknown session id", async () => {
    const repo = tempRepo();
    await withSdk(repo, standardData(), async (sdk) => {
      const integration = createContextIntegration({ context: sdk, sessions: fakeSessions().port });
      const result = await integration.attach({ sessionId: "nope", task: "double" });
      expect(result.ok).toBe(false);
    });
  });
});

/** An in-memory SessionPort fake that records how sessions were launched. */
function fakeSessions(options: { running?: boolean } = {}): {
  port: SessionPort;
  launchPrompts: string[];
} {
  const sessions: Session[] = [];
  const launchPrompts: string[] = [];
  let nextId = 1;

  const port: SessionPort = {
    createSession: (request) => {
      const session: Session = {
        id: `s${nextId++}`,
        agentId: `agent:${request.provider}` as Session["agentId"],
        provider: request.provider,
        repositoryPath: request.repositoryPath,
        status: options.running ? "RUNNING" : "CREATED",
        processId: options.running ? 42 : undefined,
        startedAt: options.running ? 1 : undefined,
        endedAt: undefined,
        exitCode: undefined,
        error: undefined,
      };
      sessions.push(session);
      return ok(session);
    },
    startSession: async (id, launch) => {
      const session = sessions.find((s) => s.id === id);
      if (session === undefined) {
        return { ok: false, error: new SessionStateError(id, "unknown session") };
      }
      if (launch?.prompt !== undefined) {
        launchPrompts.push(launch.prompt);
      }
      const started: Session = {
        ...session,
        status: "RUNNING",
        startedAt: Date.now(),
        processId: 1,
      };
      sessions[sessions.indexOf(session)] = started;
      return ok(started);
    },
    getSession: (id) => sessions.find((s) => s.id === id),
    listSessions: () => [...sessions],
    getActiveSessions: () =>
      sessions.filter(
        (s) => s.status === "STARTING" || s.status === "RUNNING" || s.status === "STOPPING",
      ),
    stopSession: async (id) => ({ ok: false, error: new SessionStateError(id, "not running") }),
    terminateSession: async (id) => ({
      ok: false,
      error: new SessionStateError(id, "not running"),
    }),
    getSessionOutput: () => undefined,
    shutdown: async () => {},
  };

  return { port, launchPrompts };
}
