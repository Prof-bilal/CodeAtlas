import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  Budget,
  BudgetStatus,
  Symbol as CoreSymbol,
  InstallOutcome,
  InstallPlan,
  Session,
  SourceFile,
  UsageRecord,
  UsageStatistics,
} from "@atlas/core";
import {
  ContextAttachUnsupportedError,
  type ContextExplanation,
  type ContextIntegration,
  type ContextPackage,
  type ToolkitSDK,
  createUsageService,
} from "@atlas/sdk";
import type { FilePath, SymbolId } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { describe, expect, it, vi } from "vitest";
import { createCli } from "../src/cli";
import { comingSoonMessage } from "../src/commands/coming-soon";
import { renderOverview } from "../src/commands/scan";
import { contextDbPath, renderSearchHits, resolveProjectRoot } from "../src/commands/search";
import { agentLabel, formatSessionInfo, renderSessionsTable } from "../src/commands/sessions";
import {
  formatCost,
  formatMeasured,
  renderUsageSummary,
  renderUsageTable,
  usageDbPath,
} from "../src/commands/usage";

function file(path: string, content = "export const value = 1;"): SourceFile {
  return { path: path as FilePath, language: "typescript", content };
}

function symbol(symbolId: string, name: string, filePath: string): CoreSymbol {
  return {
    id: symbolId as SymbolId,
    name,
    kind: "function",
    filePath: filePath as FilePath,
    location: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 4 },
    parentId: null,
    visibility: "exported",
    exported: true,
    modifiers: ["export"],
    moduleSpecifier: null,
    typeText: null,
    documentation: null,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "a81f",
    agentId: "claude" as Session["agentId"],
    provider: "claude",
    repositoryPath: "/projects/codeatlas",
    status: "RUNNING",
    processId: 12345,
    startedAt: 1_752_000_000_000,
    endedAt: undefined,
    exitCode: undefined,
    error: undefined,
    ...overrides,
  };
}

function fakeToolkit(overrides: Partial<ToolkitSDK> = {}): ToolkitSDK {
  return {
    registry: {} as ToolkitSDK["registry"],
    overview: async () => ({ ok: true, value: { recommended: [], installed: [] } }),
    search: () => [],
    info: async () => ({ ok: false, error: new Error("fixture not found") }),
    planInstall: async () => ({ ok: false, error: new Error("fixture not found") }),
    install: async () => ({ ok: false, error: new Error("fixture not found") }),
    remove: async () => ({ ok: false, error: new Error("fixture not found") }),
    update: async () => ({
      ok: true,
      value: { registryTools: 0, installedTools: 0, note: "fixture" },
    }),
    doctor: async () => ({ ok: true, value: [] }),
    configure: async () => ({ ok: false, error: new Error("fixture not found") }),
    ...overrides,
  } as ToolkitSDK;
}

function fakeContextIntegration(overrides: Partial<ContextIntegration> = {}): ContextIntegration {
  const pkg = {
    task: "fix auth",
    items: [],
    staleness: {
      state: "fresh",
      available: true,
      lastUpdated: "",
      changed: [],
      added: [],
      deleted: [],
    },
    budget: {
      budget: { maxItems: 20, maxTokensPerItem: 2000, maxTokensTotal: 12000 },
      itemsRequested: 0,
      itemsIncluded: 0,
      tokensEstimated: 0,
      itemsDroppedByCount: [],
      itemsTruncated: [],
      droppedByTokens: [],
      budgetExceeded: false,
    },
    exclusions: { droppedPaths: [], droppedPatterns: [] },
  } as ContextPackage;
  const explanation = { ...pkg, items: [] } as ContextExplanation;
  return {
    buildPackage: vi.fn(async () => pkg),
    explain: vi.fn(async () => explanation),
    launch: vi.fn(async () => ({
      ok: true as const,
      value: session({ id: "s1", status: "RUNNING" }),
    })),
    attach: vi.fn(async () => ({
      ok: true as const,
      value: session({ id: "s1", status: "RUNNING" }),
    })),
    ...overrides,
  };
}

/** Create a temp project root with a `.codeatlas/context.db`, run `fn`, clean up. */
async function withProject(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "atlas-cli-"));
  const dotAtlas = join(root, ".codeatlas");
  mkdirSync(dotAtlas, { recursive: true });
  const store = new ContextStore({ filePath: join(dotAtlas, "context.db") });
  store.saveContext({
    files: [file("/src/math.ts", "export function double() {}")],
    symbols: [symbol("s1", "double", "/src/math.ts")],
  });
  store.close();

  process.env["ATLAS_ROOT"] = root;
  try {
    await fn(root);
  } finally {
    process.env["ATLAS_ROOT"] = undefined;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; never mask the test result with a removal error.
    }
  }
}

describe("atlas CLI", () => {
  it("registers all expected commands", () => {
    const program = createCli();
    const names = program.commands.map((command) => command.name()).sort();
    expect(names).toEqual([
      "build",
      "context",
      "doctor",
      "explain",
      "init",
      "mcp",
      "ollama",
      "providers",
      "scan",
      "search",
      "sessions",
      "tools",
      "tui",
      "update",
      "usage",
    ]);
  });

  it("delegates context build, explain, launch, and attach through the SDK integration", async () => {
    const integration = fakeContextIntegration();
    const program = createCli({ integration });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "atlas", "context", "fix auth", "--json"]);
      await program.parseAsync(["node", "atlas", "context", "fix auth", "--explain"]);
      await program.parseAsync([
        "node",
        "atlas",
        "context",
        "launch",
        "fix auth",
        "--provider",
        "claude",
        "--json",
      ]);
      await program.parseAsync(["node", "atlas", "context", "attach", "s1", "fix auth", "--json"]);
      expect(integration.buildPackage).toHaveBeenCalledWith(
        expect.objectContaining({ task: "fix auth" }),
      );
      expect(integration.explain).toHaveBeenCalledWith(
        expect.objectContaining({ task: "fix auth" }),
      );
      expect(integration.launch).toHaveBeenCalledWith(
        expect.objectContaining({ task: "fix auth", provider: "claude" }),
      );
      expect(integration.attach).toHaveBeenCalledWith(
        expect.objectContaining({ task: "fix auth", sessionId: "s1" }),
      );
      expect(log.mock.calls.join(" ")).toContain("fresh");
    } finally {
      log.mockRestore();
    }
  });

  it("maps unsupported context attach errors to exit code 1 without crashing", async () => {
    const integration = fakeContextIntegration({
      attach: vi.fn(async () => ({
        ok: false as const,
        error: new ContextAttachUnsupportedError("s1", "RUNNING"),
      })),
    });
    const program = createCli({ integration });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const previousExitCode = process.exitCode;
    try {
      await program.parseAsync(["node", "atlas", "context", "attach", "s1", "fix auth"]);
      expect(error.mock.calls.join(" ").toLowerCase()).toContain("cannot attach");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
      error.mockRestore();
    }
  });

  it("registers the complete thin Toolkit command surface", () => {
    const tools = createCli().commands.find((command) => command.name() === "tools");
    expect(tools?.commands.map((command) => command.name()).sort()).toEqual([
      "configure",
      "doctor",
      "info",
      "install",
      "remove",
      "search",
      "update",
    ]);
  });

  it("delegates Toolkit search and renders JSON without touching Toolkit internals", async () => {
    const search = vi.fn(() => [
      { name: "fixture", description: "fixture tool", trust: "unverified" },
    ]) as unknown as ToolkitSDK["search"];
    const toolkit = fakeToolkit({ search });
    const program = createCli({ toolkit });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "atlas", "tools", "search", "fixture", "--json"]);
      expect(search).toHaveBeenCalledWith("fixture");
      expect(log.mock.calls.join(" ")).toContain('"fixture"');
    } finally {
      log.mockRestore();
    }
  });

  it("keeps --yes --json installation output to one JSON document", async () => {
    const plan: InstallPlan = {
      toolName: "fixture",
      method: "npm",
      command: { binary: "npm", args: ["install", "--global", "fixture"], cwd: null },
      uninstallCommand: null,
      effect: "install fixture",
      dangerous: [],
      verifyBinary: "fixture",
      security: {
        toolName: "fixture",
        checks: [],
        risk: "medium",
        status: "unverified",
        trust: "unverified",
        note: "fixture",
        assessedAt: "2026-08-13T00:00:00.000Z",
        overrideRequired: true,
      },
    };
    const outcome: InstallOutcome = {
      plan,
      verification: "unverified",
      verificationNote: "fixture",
      exitCode: 0,
      rollback: "none",
      recordedAt: "2026-08-13T00:00:00.000Z",
      log: [],
      manifestPath: null,
    };
    const install = vi.fn(async () => ({
      ok: true as const,
      value: outcome,
    }));
    const toolkit = fakeToolkit({
      planInstall: vi.fn(async () => ({ ok: true as const, value: plan })),
      install,
    });
    const program = createCli({ toolkit });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const previousExitCode = process.exitCode;
    try {
      await program.parseAsync(["node", "atlas", "tools", "install", "fixture", "--yes", "--json"]);
      expect(install).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledOnce();
      expect(() => JSON.parse(log.mock.calls[0]?.[0] as string)).not.toThrow();
      expect(error).not.toHaveBeenCalled();
    } finally {
      process.exitCode = previousExitCode;
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("delegates configure and doctor through an injected SDK façade", async () => {
    const configure = vi.fn(async () => ({
      ok: true as const,
      value: {
        toolName: "fixture",
        configHome: "/tmp",
        dryRun: true,
        appliedTargets: [],
        verifiedTargets: [],
        skippedTargets: [],
        failedTargets: [],
        targetChecks: [],
        changes: [],
      },
    }));
    const doctor = vi.fn(async () => ({
      ok: true as const,
      value: [
        {
          name: "fixture",
          manifest: "present" as const,
          integration: "installed",
          trust: "unverified",
        },
      ],
    }));
    const toolkit = fakeToolkit({ configure, doctor });
    const program = createCli({ toolkit });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "atlas", "tools", "configure", "fixture", "--dry-run"]);
      await program.parseAsync(["node", "atlas", "tools", "doctor", "--json"]);
      expect(configure).toHaveBeenCalledWith("fixture", { dryRun: true });
      expect(doctor).toHaveBeenCalledOnce();
      expect(log.mock.calls.join(" ")).toContain('"manifest"');
    } finally {
      log.mockRestore();
    }
  });

  it("exposes the mcp command with its help text", () => {
    const program = createCli();
    const mcp = program.commands.find((command) => command.name() === "mcp");
    expect(mcp).toBeDefined();
    expect((mcp?.description() ?? "").toLowerCase()).toContain("mcp");
  });

  it("reports the SDK version", () => {
    const program = createCli();
    expect(program.version()).toBeTruthy();
  });

  it("prints a Coming Soon placeholder message", () => {
    expect(comingSoonMessage("init")).toContain("Coming Soon");
  });

  it("resolves the project root and the context database path", () => {
    const root = join(tmpdir(), "atlas-project-test");
    process.env["ATLAS_ROOT"] = root;
    try {
      expect(resolveProjectRoot()).toBe(resolve(root));
      expect(contextDbPath(resolve(root))).toBe(join(resolve(root), ".codeatlas", "context.db"));
    } finally {
      process.env["ATLAS_ROOT"] = undefined;
    }
  });

  it("renders ranked search hits as text", () => {
    const rendered = renderSearchHits("double", [
      {
        kind: "symbol",
        title: "double",
        path: "/src/math.ts" as FilePath,
        targetId: "symbol:s1",
        score: 100,
      },
      {
        kind: "dependency",
        title: "/src/auth.ts â†’ /src/math.ts",
        path: null,
        targetId: "dependency:n:file:/src/auth.ts::imports::n:file:/src/math.ts",
        relation: "imports",
        score: 60,
      },
    ]);
    expect(rendered).toContain('2 results for "double"');
    expect(rendered).toContain("symbol");
    expect(rendered).toContain("double");
    expect(rendered).toContain("[imports]");
  });

  it("queries a persisted index via `atlas search`", async () => {
    await withProject(async () => {
      const program = createCli();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      let output = "";
      try {
        await program.parseAsync(["node", "atlas", "search", "double"]);
        output = log.mock.calls.map((call) => call.join(" ")).join("\n");
      } finally {
        log.mockRestore();
        error.mockRestore();
      }
      expect(output).toContain("symbol");
      expect(output).toContain("double");
      expect(error).not.toHaveBeenCalled();
    });
  });

  it("resolves the index via `--repo` without ATLAS_ROOT", async () => {
    await withProject(async (root) => {
      process.env["ATLAS_ROOT"] = undefined;
      const program = createCli();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      let output = "";
      try {
        await program.parseAsync(["node", "atlas", "search", "double", "--repo", root]);
        output = log.mock.calls.map((call) => call.join(" ")).join("\n");
      } finally {
        log.mockRestore();
      }
      expect(output).toContain("double");
    });
  });

  it("fails cleanly when no index exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-cli-empty-"));
    process.env["ATLAS_ROOT"] = root;
    const previousExitCode = process.exitCode;
    try {
      const program = createCli();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      let stderr = "";
      try {
        await program.parseAsync(["node", "atlas", "search", "double"]);
        stderr = error.mock.calls.map((call) => call.join(" ")).join("\n");
      } finally {
        error.mockRestore();
      }
      expect(stderr).toContain("No context index found");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
      process.env["ATLAS_ROOT"] = undefined;
      rmSync(root, { recursive: true, force: true });
    }
  });

  describe("sessions rendering", () => {
    it("renders an empty session list", () => {
      expect(renderSessionsTable([])).toBe("No sessions.");
    });

    it("renders a table of sessions", () => {
      const rendered = renderSessionsTable([
        session(),
        session({
          id: "b92d",
          provider: "gemini",
          agentId: "gemini" as Session["agentId"],
          repositoryPath: "/projects/frontend",
        }),
        session({
          id: "c73a",
          provider: "codex",
          agentId: "codex" as Session["agentId"],
          repositoryPath: "/projects/api",
          status: "STOPPED",
          processId: undefined,
          startedAt: undefined,
          exitCode: 0,
          endedAt: 1_752_010_000_000,
        }),
      ]);
      expect(rendered).toContain("Active Sessions");
      expect(rendered).toContain("a81f");
      expect(rendered).toContain("Claude");
      expect(rendered).toContain("Gemini");
      expect(rendered).toContain("Codex");
      expect(rendered).toContain("codeatlas");
      expect(rendered).toContain("RUNNING");
      expect(rendered).toContain("STOPPED");
    });

    it("labels known providers nicely", () => {
      expect(agentLabel("claude")).toBe("Claude");
      expect(agentLabel("gemini")).toBe("Gemini");
      expect(agentLabel("codex")).toBe("Codex");
      expect(agentLabel("opencode")).toBe("OpenCode");
    });

    it("formats session info, omitting absent fields", () => {
      const rendered = formatSessionInfo(session());
      expect(rendered).toContain("Session: a81f");
      expect(rendered).toContain("Provider: Claude");
      expect(rendered).toContain("Status: RUNNING");
      expect(rendered).toContain("PID: 12345");
      expect(rendered).toContain("Repository: /projects/codeatlas");

      const bare = formatSessionInfo(
        session({ status: "CREATED", processId: undefined, startedAt: undefined }),
      );
      expect(bare).not.toContain("PID:");
      expect(bare).not.toContain("Started:");
    });
  });

  it("lists no sessions via `atlas sessions list`", async () => {
    const program = createCli();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "atlas", "sessions", "list"]);
      const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(output).toContain("No sessions.");
    } finally {
      log.mockRestore();
    }
  });

  it("reports a missing session for `atlas sessions stop`", async () => {
    const program = createCli();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const previousExitCode = process.exitCode;
    try {
      await program.parseAsync(["node", "atlas", "sessions", "stop", "missing"]);
      const stderr = error.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(stderr).toContain("Session not found: missing");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
      error.mockRestore();
      log.mockRestore();
    }
  });

  describe("atlas scan", () => {
    it("renders a hierarchical overview with totals and languages", async () => {
      const root = mkdtempSync(join(tmpdir(), "atlas-scan-"));
      try {
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "src", "math.ts"), "export function double() {}\n");
        writeFileSync(join(root, "src", "index.ts"), "export const answer = 42;\n");
        writeFileSync(join(root, "README.md"), "# Demo\n");

        const program = createCli();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
          await program.parseAsync(["node", "atlas", "scan", "--repo", root]);
          const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
          expect(output).toContain("3 files in 1 folders");
          expect(output).toContain("typescript (2)");
          expect(output).toContain("[d] src/");
          expect(output).toContain("math.ts");
        } finally {
          log.mockRestore();
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("emits JSON output with --json", async () => {
      const root = mkdtempSync(join(tmpdir(), "atlas-scan-"));
      try {
        writeFileSync(join(root, "app.ts"), "export const value = 1;\n");
        const program = createCli();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
          await program.parseAsync(["node", "atlas", "scan", "--repo", root, "--json"]);
          const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
          expect(output).toContain('"totalFiles": 1');
          expect(output).toContain('"app.ts"');
        } finally {
          log.mockRestore();
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("renderOverview summarizes the scan textually", () => {
      const text = renderOverview({
        name: "demo",
        rootPath: "/demo" as never,
        totalFiles: 2,
        totalFolders: 1,
        tree: [
          {
            name: "src",
            path: "/demo/src" as never,
            type: "directory",
            children: [
              { name: "math.ts", path: "/demo/src/math.ts" as never, type: "file", children: [] },
            ],
          },
        ],
        files: [],
        fileTypes: [],
        languages: [{ name: "typescript", fileCount: 2, extensions: ["ts"] }],
        framework: "react",
        hasPackageJson: true,
        hasTsconfig: true,
        hasReadme: true,
        isGitRepository: true,
      });
      expect(text).toContain("demo — 2 files in 1 folders");
      expect(text).toContain("typescript (2)");
      expect(text).toContain("Framework: react");
      expect(text).toContain("[d] src/");
      expect(text).toContain("math.ts");
    });
  });

  describe("usage rendering and CLI", () => {
    it("resolves the usage database path next to the context database", () => {
      const root = resolve(join(tmpdir(), "atlas-project-usage"));
      expect(usageDbPath(root)).toBe(join(root, ".codeatlas", "usage.db"));
    });

    it("formats measured quantities and costs with their provenance", () => {
      expect(formatMeasured({ source: "actual", value: 120 })).toBe("120");
      expect(formatMeasured({ source: "estimated", value: 120 })).toBe("120 (estimated)");
      expect(formatMeasured({ source: "unknown", value: null })).toBe("unknown");
      expect(formatCost({ currency: "USD", amount: { source: "estimated", value: 0.033 } })).toBe(
        "USD 0.033",
      );
      expect(formatCost({ currency: null, amount: { source: "unknown", value: null } })).toBe(
        "unknown",
      );
    });

    it("renders the usage summary with budget status", () => {
      const stats: UsageStatistics = {
        events: 2,
        requests: 3,
        tokens: {
          input: { source: "actual", value: 1_000 },
          output: { source: "actual", value: 2_000 },
          total: { source: "actual", value: 3_000 },
        },
        cost: { currency: "USD", amount: { source: "estimated", value: 0.033 } },
        latency: {
          samples: 2,
          avgMs: { source: "actual", value: 150 },
          maxMs: { source: "actual", value: 200 },
          p95Ms: { source: "actual", value: 200 },
        },
        byProvider: {},
        byDay: {},
      };
      const budget: Budget = {
        id: "b1",
        scope: { kind: "agent", value: "claude" },
        tokenLimit: 10_000,
        costLimit: null,
        currency: "USD",
        createdAt: "2026-08-11T10:00:00.000Z",
      };
      const status: BudgetStatus = {
        budget,
        consumedTokens: {
          input: { source: "actual", value: 1_000 },
          output: { source: "actual", value: 2_000 },
          total: { source: "actual", value: 3_000 },
        },
        consumedCost: { currency: "USD", amount: { source: "estimated", value: 0.033 } },
        tokenPercent: 30,
        costPercent: null,
      };
      const rendered = renderUsageSummary(stats, [status]);
      expect(rendered).toContain("Usage summary");
      expect(rendered).toContain("Events:      2");
      expect(rendered).toContain("Requests:    3");
      expect(rendered).toContain("total 3000");
      expect(rendered).toContain("agent:claude");
      expect(rendered).toContain("30%");
    });

    it("renders a usage table and an empty-state message", () => {
      const record: UsageRecord = {
        id: "abc123",
        source: "provider",
        agent: "claude",
        provider: "claude",
        model: "claude-sonnet-5",
        sessionId: null,
        taskId: null,
        taskRef: null,
        occurredAt: "2026-08-11T10:00:00.000Z",
        requestCount: 1,
        latencyMs: 120,
        exitCode: null,
        timedOut: false,
        tokens: {
          input: { source: "actual", value: 1_000 },
          output: { source: "actual", value: 2_000 },
          total: { source: "actual", value: 3_000 },
        },
        cost: { currency: "USD", amount: { source: "estimated", value: 0.033 } },
      };
      const rendered = renderUsageTable([record]);
      expect(rendered).toContain("abc123");
      expect(rendered).toContain("claude");
      expect(rendered).toContain("claude-sonnet-5");
      expect(rendered).toContain("3000");
      expect(renderUsageTable([])).toBe("No usage recorded.");
    });

    it("reports no usage on a fresh project via `atlas usage list`", async () => {
      await withProject(async () => {
        const program = createCli();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
          await program.parseAsync(["node", "atlas", "usage", "list"]);
          const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
          expect(output).toContain("No usage recorded.");
        } finally {
          log.mockRestore();
        }
      });
    });

    it("lists recorded usage and budget status via the CLI", async () => {
      await withProject(async (root) => {
        const usage = createUsageService({ filePath: join(root, ".codeatlas", "usage.db") });
        await usage.record({
          source: "provider",
          provider: "claude",
          model: "claude-sonnet-5",
          latencyMs: 120,
          inputTokens: 1_000,
          outputTokens: 2_000,
          occurredAt: "2026-08-11T10:00:00.000Z",
        });
        usage.setBudget({ scope: { kind: "agent", value: "claude" }, tokenLimit: 10_000 });
        usage.close();

        const program = createCli();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
          await program.parseAsync(["node", "atlas", "usage", "list"]);
          const list = log.mock.calls.map((call) => call.join(" ")).join("\n");
          expect(list).toContain("claude");
          expect(list).toContain("claude-sonnet-5");
          expect(list).toContain("3000");

          log.mockClear();
          await program.parseAsync(["node", "atlas", "usage"]);
          const summary = log.mock.calls.map((call) => call.join(" ")).join("\n");
          expect(summary).toContain("Usage summary");
          expect(summary).toContain("Events:      1");
          expect(summary).toContain("agent:claude");
          expect(summary).toContain("30%");
        } finally {
          log.mockRestore();
        }
      });
    });

    it("emits JSON output with --json", async () => {
      await withProject(async (root) => {
        const usage = createUsageService({ filePath: join(root, ".codeatlas", "usage.db") });
        await usage.record({
          source: "provider",
          provider: "claude",
          model: "claude-sonnet-5",
          latencyMs: 10,
          inputTokens: 1,
          outputTokens: 1,
          occurredAt: "2026-08-11T00:00:00.000Z",
        });
        usage.close();

        const program = createCli();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
          await program.parseAsync(["node", "atlas", "usage", "list", "--json"]);
          const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
          expect(output).toContain('"records"');
          expect(output).toContain('"provider": "claude"');
        } finally {
          log.mockRestore();
        }
      });
    });
  });

  describe("providers & ollama commands", () => {
    const configPath = () => join(tmpdir(), `atlas-providers-cli-${Date.now()}.json`);

    it("shows every provider in `atlas providers`", async () => {
      const program = createCli();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const env = process.env["ATLAS_PROVIDERS_CONFIG"];
      process.env["ATLAS_PROVIDERS_CONFIG"] = configPath();
      try {
        await program.parseAsync(["node", "atlas", "providers"]);
        const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(output).toContain("AI PROVIDERS");
        expect(output).toContain("ollama");
        expect(output).toContain("Default provider: claude");
      } finally {
        process.env["ATLAS_PROVIDERS_CONFIG"] = env;
        log.mockRestore();
      }
    });

    it("prints the Ollama status for `atlas ollama` and `atlas ollama status`", async () => {
      const program = createCli();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const env = process.env["ATLAS_PROVIDERS_CONFIG"];
      process.env["ATLAS_PROVIDERS_CONFIG"] = configPath();
      try {
        await program.parseAsync(["node", "atlas", "ollama"]);
        const bare = log.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(bare).toContain("OLLAMA");
        expect(bare).toContain("Not connected");
        log.mockClear();
        await program.parseAsync(["node", "atlas", "ollama", "status"]);
        const status = log.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(status).toContain("Mode: local");
      } finally {
        process.env["ATLAS_PROVIDERS_CONFIG"] = env;
        log.mockRestore();
      }
    });

    it("selects an Ollama model with `atlas ollama use`", async () => {
      const path = configPath();
      const program = createCli();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const env = process.env["ATLAS_PROVIDERS_CONFIG"];
      process.env["ATLAS_PROVIDERS_CONFIG"] = path;
      try {
        await program.parseAsync(["node", "atlas", "ollama", "use", "qwen3"]);
        const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(output).toContain("qwen3");
        const persisted = JSON.parse(readFileSync(path, "utf8")) as { activeModel: string };
        expect(persisted.activeModel).toBe("qwen3");
      } finally {
        process.env["ATLAS_PROVIDERS_CONFIG"] = env;
        log.mockRestore();
        rmSync(path, { force: true });
      }
    });

    it("reports the connection failure exit code for `atlas ollama connect`", async () => {
      const program = createCli();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const env = process.env["ATLAS_PROVIDERS_CONFIG"];
      process.env["ATLAS_PROVIDERS_CONFIG"] = configPath();
      process.env["OLLAMA_BASE_URL"] = "http://127.0.0.1:1";
      try {
        await program.parseAsync(["node", "atlas", "ollama", "connect"]);
        expect(process.exitCode).toBe(1);
      } finally {
        process.env["ATLAS_PROVIDERS_CONFIG"] = env;
        process.env["OLLAMA_BASE_URL"] = undefined;
        log.mockRestore();
        process.exitCode = undefined;
      }
    });
  });
});
