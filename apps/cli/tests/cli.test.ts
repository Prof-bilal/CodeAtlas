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
  ToolRegistryRecord,
  UsageRecord,
  UsageStatistics,
} from "@atlas/core";
import {
  type AgentMcpPort,
  type AgentMcpStatus,
  type ConfigureOutcome,
  ContextAttachUnsupportedError,
  type ContextBriefing,
  type ContextExplanation,
  type ContextIntegration,
  type ContextPackage,
  type ContextSDK,
  type SearchResult,
  type SessionPort,
  type Summary,
  type SummaryPort,
  type ToolkitSDK,
  createUsageService,
} from "@atlas/sdk";
import { type FilePath, type Result, type SymbolId, fail, ok } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { describe, expect, it, vi } from "vitest";
import pkg from "../package.json";
import { createCli } from "../src/cli";
import { type DoctorServices, renderDoctorReport } from "../src/commands/doctor";
import { parseToolSelection } from "../src/commands/indexing";
import { renderOverview } from "../src/commands/scan";
import {
  AI_SUMMARY_LIMIT,
  buildSearchAI,
  contextDbPath,
  renderSearchAI,
  renderSearchHits,
  resolveProjectRoot,
} from "../src/commands/search";
import {
  agentLabel,
  computeSessionTokenImpact,
  formatSessionInfo,
  renderSessionTokenImpact,
  renderSessionsTable,
  sessionBurnedTokens,
  wholeRepoBaselineTokens,
} from "../src/commands/sessions";
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
    listByCategory: () => [],
    info: async () => ({ ok: false, error: new Error("fixture not found") }),
    planInstall: async () => ({ ok: false, error: new Error("fixture not found") }),
    install: async () => ({ ok: false, error: new Error("fixture not found") }),
    remove: async () => ({ ok: false, error: new Error("fixture not found") }),
    update: async () => ({
      ok: true,
      value: { registryTools: 0, installedTools: 0, note: "fixture" },
    }),
    doctor: async () => ({ ok: true as const, value: [] }),
    configure: async () => ({ ok: false, error: new Error("fixture not found") }),
    ...overrides,
  } as ToolkitSDK;
}

function fakeAgentMcp(
  overrides: Partial<AgentMcpPort> = {},
  status?: AgentMcpStatus,
): AgentMcpPort & { configureCalls: unknown[] } {
  const configureCalls: unknown[] = [];
  const entries = status?.entries ?? [
    {
      target: "claude" as const,
      label: "Claude",
      available: true,
      filePath: "~/.claude/settings.json",
      configured: true,
      detail: "agent detected (1.0.0)",
    },
    {
      target: "gemini" as const,
      label: "Gemini",
      available: false,
      filePath: "~/.gemini/settings.json",
      configured: false,
      detail: "agent is not installed or could not be detected",
    },
  ];
  const configured: AgentMcpStatus = status ?? {
    entries,
    needsConfiguration: false,
  };
  const outcome: ConfigureOutcome = {
    toolName: "codeatlas",
    configHome: "/tmp",
    dryRun: false,
    appliedTargets: [],
    verifiedTargets: [],
    skippedTargets: [],
    failedTargets: [],
    targetChecks: [],
    changes: [],
  };
  return {
    configureCalls,
    targets: ["claude", "gemini", "codex", "opencode", "cursor", "cline"],
    status: async () => ({ ok: true, value: configured }),
    configure: async (options = {}) => {
      configureCalls.push(options);
      const appliedTargets = (options.targets ?? []) as string[];
      const result: ConfigureOutcome = {
        ...outcome,
        appliedTargets,
        verifiedTargets: appliedTargets,
      };
      return { ok: true, value: result };
    },
    ...overrides,
  } as AgentMcpPort & { configureCalls: unknown[] };
}

function fakeDoctorServices(overrides: Partial<DoctorServices> = {}): DoctorServices {
  return {
    agents: {
      detectAll: async () => ({
        ok: true as const,
        value: [
          {
            provider: "claude",
            binary: "claude",
            available: true,
            path: "/usr/local/bin/claude",
            version: "1.0.0",
          },
        ],
      }),
    } as unknown as NonNullable<DoctorServices["agents"]>,
    agentMcp: fakeAgentMcp() as unknown as NonNullable<DoctorServices["agentMcp"]>,
    providers: {
      status: () => [
        {
          name: "claude",
          configured: true,
          hasApiKey: true,
          model: "claude-sonnet",
          defaultModel: "claude-sonnet",
        },
        {
          name: "ollama",
          configured: true,
          hasApiKey: false,
          model: null,
          defaultModel: "llama3",
        },
      ],
    },
    ollama: {
      status: () => ({
        connected: true,
        mode: "local" as const,
        baseUrl: "http://localhost:11434",
        hasApiKey: false,
        keyDisplay: "",
        model: "llama3",
      }),
    },
    ...overrides,
  };
}

function fakeContextIntegration(overrides: Partial<ContextIntegration> = {}): ContextIntegration {
  const pkg = fakeContextIntegrationPackage();
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
    brief: vi.fn(async () => ({
      ok: false as const,
      error: new Error("brief not configured for this fake"),
    })),
    ...overrides,
  };
}

/** The deterministic package `fakeContextIntegration` returns (and briefings wrap). */
function fakeContextIntegrationPackage(): ContextPackage {
  return {
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
  };
}

/** A provider-backed briefing of the fake package (used by `--ai` tests). */
function aiBriefing(): ContextBriefing {
  const pkg = fakeContextIntegrationPackage();
  return {
    task: pkg.task,
    content: {
      overview: "Auth is handled in /src/auth.ts.",
      keyPoints: ["login calls double"],
    },
    metadata: {
      generatedAt: "2026-08-15T00:00:00.000Z",
      provider: "claude",
      model: "claude-sonnet-5",
      prompt: null,
      cacheHit: false,
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    package: pkg,
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

function aiSummary(path: string, overrides: Partial<Summary> = {}): Summary {
  return {
    kind: "file",
    target: path,
    content: { overview: `Overview of ${path}`, keyPoints: ["point one", "point two"] },
    metadata: {
      generatedAt: "2026-08-15T00:00:00.000Z",
      provider: "ollama",
      model: "llama3.2",
      prompt: null,
      cacheHit: false,
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    ...overrides,
  };
}

function fileHit(path: string): SearchResult {
  return { kind: "file", title: path, path: path as FilePath, targetId: null, score: 10 };
}

/** A throwaway project root for `init` end-to-end tests (no indexing side effects). */
function createTempFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-init-"));
  const dotAtlas = join(root, ".codeatlas");
  mkdirSync(dotAtlas, { recursive: true });
  return root;
}

function fakeSearchContext(
  summaries: {
    stored?: (path: string) => Summary | undefined;
    generate?: (path: string) => Promise<Result<Summary>>;
  } = {},
): ContextSDK {
  return {
    summaries: {
      getFileSummary: summaries.stored ?? (() => undefined),
      generateFile: summaries.generate ?? (async () => fail(new Error("no provider configured"))),
    },
  } as unknown as ContextSDK;
}

describe("atlas CLI", () => {
  it("registers all expected commands", () => {
    const program = createCli();
    const names = program.commands.map((command) => command.name()).sort();
    expect(names).toEqual([
      "agents",
      "build",
      "claude",
      "codex",
      "context",
      "doctor",
      "explain",
      "gemini",
      "init",
      "mcp",
      "metrics",
      "ollama",
      "opencode",
      "providers",
      "scan",
      "search",
      "sessions",
      "tools",
      "update",
      "usage",
    ]);
  });

  it("parses the recommended-tools selection for the post-init offer", () => {
    expect(parseToolSelection("all", 10)).toEqual({
      ok: true,
      value: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
    expect(parseToolSelection("none", 10)).toEqual({ ok: true, value: [] });
    expect(parseToolSelection("1,2,3", 10)).toEqual({ ok: true, value: [0, 1, 2] });
    expect(parseToolSelection(" 2 , 5 ", 10)).toEqual({ ok: true, value: [1, 4] });
    expect(parseToolSelection("1,1", 10)).toEqual({ ok: true, value: [0] }); // deduped
    expect(parseToolSelection("11", 10).ok).toBe(false);
    expect(parseToolSelection("0", 10).ok).toBe(false);
    expect(parseToolSelection("x", 10).ok).toBe(false);
    expect(parseToolSelection("", 10).ok).toBe(false);
  });

  it("installs the selected recommended tools after init without a prompt when --tools is given", async () => {
    const toolkit = fakeToolkit({
      overview: async () => ({
        ok: true,
        value: {
          recommended: [
            { name: "mcp-builder" },
            { name: "systematic-debugging" },
          ] as unknown as Awaited<ReturnType<ToolkitSDK["overview"]>> extends { ok: true }
            ? Awaited<ReturnType<ToolkitSDK["overview"]>> extends { ok: true; value: infer V }
              ? V extends { recommended: readonly unknown[] }
                ? V["recommended"]
                : never
              : never
            : never,
          installed: [],
        },
      }),
      planInstall: async (toolName) => ({
        ok: true,
        value: {
          toolName,
          method: "skill",
          command: { binary: "git", args: ["clone", toolName], cwd: null },
          uninstallCommand: null,
          effect: `install ${toolName}`,
          dangerous: [],
          verifyBinary: toolName,
          verifyPath: null,
          security: {
            toolName,
            checks: [],
            risk: "medium",
            status: "unverified",
            trust: "unverified",
            note: "fixture",
            assessedAt: "2026-08-13T00:00:00.000Z",
            overrideRequired: true,
          },
        },
      }),
      install: async () => ({
        ok: true,
        value: {
          plan: { security: { trust: "unverified" } } as InstallOutcome["plan"],
          verification: "verified",
          verificationNote: "found SKILL.md",
          exitCode: 0,
          rollback: "none" as const,
          recordedAt: "2026-08-13T00:00:00.000Z",
          log: [],
          manifestPath: null,
        },
      }),
    });
    const installSpy = vi.spyOn(toolkit, "install");
    const program = createCli({ toolkit });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync([
        "node",
        "atlas",
        "init",
        "--repo",
        createTempFixtureRoot(),
        "--tools",
        "1,2",
      ]);
      expect(installSpy).toHaveBeenCalledTimes(2);
      expect(installSpy).toHaveBeenCalledWith("mcp-builder", { granted: true });
      expect(installSpy).toHaveBeenCalledWith("systematic-debugging", { granted: true });
      expect(log.mock.calls.join(" ")).toContain("Installed");
    } finally {
      log.mockRestore();
      installSpy.mockRestore();
    }
  });

  it("does not install anything when the user declines (--tools none)", async () => {
    const toolkit = fakeToolkit({
      overview: async () => ({
        ok: true,
        value: {
          recommended: [{ name: "mcp-builder" }] as unknown as Awaited<
            ReturnType<ToolkitSDK["overview"]>
          > extends { ok: true }
            ? Awaited<ReturnType<ToolkitSDK["overview"]>> extends { ok: true; value: infer V }
              ? V extends { recommended: readonly unknown[] }
                ? V["recommended"]
                : never
              : never
            : never,
          installed: [],
        },
      }),
    });
    const installSpy = vi.spyOn(toolkit, "install");
    const program = createCli({ toolkit });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync([
        "node",
        "atlas",
        "init",
        "--repo",
        createTempFixtureRoot(),
        "--tools",
        "none",
      ]);
      expect(installSpy).not.toHaveBeenCalled();
      expect(log.mock.calls.join(" ")).toContain("Skipped installing recommended tools");
    } finally {
      log.mockRestore();
      installSpy.mockRestore();
    }
  });

  it("lists tool categories via atlas tools categories", async () => {
    const toolkit = fakeToolkit({
      registry: {
        listCategories: () => ["MCP", "Agent Tools", "Developer Productivity"],
      } as unknown as ToolkitSDK["registry"],
    });
    const program = createCli({ toolkit });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "atlas", "tools", "categories"]);
      expect(log.mock.calls.join("\n")).toContain("MCP");
      expect(log.mock.calls.join("\n")).toContain("Agent Tools");
    } finally {
      log.mockRestore();
    }
  });

  it("filters tools by category via atlas tools --category", async () => {
    const toolkit = fakeToolkit({
      listByCategory: (cat: string) => {
        if (cat === "MCP") {
          return [
            {
              name: "mcp-builder",
              description: "Build MCP servers",
              tier: "recommended",
              categories: ["MCP"],
            },
          ] as unknown as ReturnType<ToolkitSDK["listByCategory"]>;
        }
        return [];
      },
    });
    const program = createCli({ toolkit });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "atlas", "tools", "--category", "MCP"]);
      expect(log.mock.calls.join(" ")).toContain("mcp-builder");
    } finally {
      log.mockRestore();
    }
  });

  it("surfaces compatibility report in atlas tools info", async () => {
    const toolkit = fakeToolkit({
      info: async (name: string) => ({
        ok: true as const,
        value: {
          tool: {
            name,
            description: "Test tool",
            version: "1.0.0",
            trust: "verified" as const,
            security: { status: "clean" as const },
            installMethods: [{ type: "npm" as const }],
            repository: null,
            website: null,
            documentation: null,
            license: "MIT",
            supportedOs: [],
            supportedAgents: [],
            categories: [],
            dependencies: [],
            maintainer: null,
            lastUpdate: null,
            stars: null,
            tier: "optional" as const,
            provenance: { type: "catalog", source: "test" },
          } as unknown as ToolRegistryRecord,
          manifest: null,
          compatibility: {
            overall: "compatible" as const,
            toolName: name,
            toolVersion: "1.0.0",
            notInstallable: false,
            checks: [
              {
                id: "os",
                label: "OS",
                state: "compatible" as const,
                detail: "linux",
                advisory: false,
              },
              {
                id: "runtime:node",
                label: "Node",
                state: "compatible" as const,
                detail: ">=22.5.0",
                advisory: false,
              },
            ],
          },
        },
      }),
    });
    const program = createCli({ toolkit });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "atlas", "tools", "info", "test-tool"]);
      const output = log.mock.calls.join("\n");
      expect(output).toContain("Compatibility: compatible");
      expect(output).toContain("✓ OS: compatible");
      expect(output).toContain("✓ Node: compatible");
    } finally {
      log.mockRestore();
    }
  });

  it("runs atlas tools update and reports per-tool outcomes", async () => {
    const updateSpy = vi.fn(async () => ({
      ok: true as const,
      value: {
        registryTools: 56,
        installedTools: 2,
        updated: [
          { name: "npm-builder", status: "updated" as const, note: "Re-installed successfully." },
          {
            name: "mcp-builder",
            status: "unchanged" as const,
            note: "Approval required; re-run with approval to update.",
          },
        ],
        note: "Updated 1 of 2 installed tools.",
      },
    }));
    const toolkit = fakeToolkit({ update: updateSpy });
    const program = createCli({ toolkit });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "atlas", "tools", "update", "--approve"]);
      expect(updateSpy).toHaveBeenCalledWith({ granted: true });
      const output = log.mock.calls.join("\n");
      expect(output).toContain("✓ npm-builder: Re-installed successfully.");
      expect(output).toContain("– mcp-builder: Approval required");
    } finally {
      log.mockRestore();
    }
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
      "categories",
      "configure",
      "doctor",
      "info",
      "install",
      "remove",
      "search",
      "update",
    ]);
  });

  describe("atlas context --ai", () => {
    it("builds the package and appends the AI briefing section on success", async () => {
      const integration = fakeContextIntegration({
        brief: vi.fn(async () => ok(aiBriefing())),
      });
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await program.parseAsync(["node", "atlas", "context", "fix auth", "--ai"]);
        expect(integration.brief).toHaveBeenCalledWith(
          expect.objectContaining({ task: "fix auth" }),
        );
        expect(log.mock.calls.join(" ")).toContain("AI context briefing");
        expect(log.mock.calls.join(" ")).toContain("Auth is handled in /src/auth.ts.");
      } finally {
        log.mockRestore();
      }
    });

    it("emits the briefing document as JSON with --ai --json", async () => {
      const integration = fakeContextIntegration({
        brief: vi.fn(async () => ok(aiBriefing())),
      });
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await program.parseAsync(["node", "atlas", "context", "fix auth", "--ai", "--json"]);
        const output = log.mock.calls.join(" ");
        expect(output).toContain('"overview"');
        expect(output).toContain("Auth is handled in /src/auth.ts.");
        expect(output).toContain('"package"');
      } finally {
        log.mockRestore();
      }
    });

    it("degrades to the deterministic package when the briefing fails", async () => {
      const integration = fakeContextIntegration({
        brief: vi.fn(async () => fail(new Error("no provider configured"))),
      });
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await program.parseAsync(["node", "atlas", "context", "fix auth", "--ai"]);
        expect(integration.buildPackage).toHaveBeenCalledWith(
          expect.objectContaining({ task: "fix auth" }),
        );
        expect(log.mock.calls.join(" ")).toContain(
          "AI briefing unavailable: no provider configured",
        );
        expect(log.mock.calls.join(" ")).toContain("# Task");
      } finally {
        log.mockRestore();
      }
    });

    it("records the AI failure in JSON output without crashing", async () => {
      const integration = fakeContextIntegration({
        brief: vi.fn(async () => fail(new Error("no provider configured"))),
      });
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await program.parseAsync(["node", "atlas", "context", "fix auth", "--ai", "--json"]);
        const output = log.mock.calls.join(" ");
        expect(output).toContain('"aiMessage"');
        expect(output).toContain("no provider configured");
      } finally {
        log.mockRestore();
      }
    });

    it("launch --ai prepends the briefing to the session prompt", async () => {
      const integration = fakeContextIntegration({
        brief: vi.fn(async () => ok(aiBriefing())),
      });
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await program.parseAsync([
          "node",
          "atlas",
          "context",
          "launch",
          "fix auth",
          "--provider",
          "claude",
          "--ai",
        ]);
        expect(integration.launch).toHaveBeenCalledWith(
          expect.objectContaining({
            task: "fix auth",
            provider: "claude",
            prompt: expect.stringContaining("Auth is handled in /src/auth.ts."),
          }),
        );
        expect(log.mock.calls.join(" ")).toContain("Session s1 started");
      } finally {
        log.mockRestore();
      }
    });

    it("attach --ai prepends the briefing to the session prompt", async () => {
      const integration = fakeContextIntegration({
        brief: vi.fn(async () => ok(aiBriefing())),
      });
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await program.parseAsync(["node", "atlas", "context", "attach", "s1", "fix auth", "--ai"]);
        expect(integration.attach).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: "s1",
            task: "fix auth",
            prompt: expect.stringContaining("Auth is handled in /src/auth.ts."),
          }),
        );
        expect(log.mock.calls.join(" ")).toContain("Session s1 started");
      } finally {
        log.mockRestore();
      }
    });

    it("launch --ai still launches when the briefing fails", async () => {
      const integration = fakeContextIntegration({
        brief: vi.fn(async () => fail(new Error("no provider configured"))),
      });
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await program.parseAsync([
          "node",
          "atlas",
          "context",
          "launch",
          "fix auth",
          "--provider",
          "claude",
          "--ai",
        ]);
        expect(error.mock.calls.join(" ")).toContain("AI briefing unavailable");
        expect(integration.launch).toHaveBeenCalledWith(
          expect.not.objectContaining({ prompt: expect.anything() }),
        );
        expect(log.mock.calls.join(" ")).toContain("Session s1 started");
      } finally {
        log.mockRestore();
        error.mockRestore();
      }
    });
  });

  describe("atlas <agent> launch commands", () => {
    const AGENTS = ["claude", "gemini", "codex", "opencode"];

    it("registers a standalone launch command for every supported agent", () => {
      const program = createCli();
      for (const agent of AGENTS) {
        expect(program.commands.some((command) => command.name() === agent)).toBe(true);
      }
    });

    it("launches the agent seeded with the rendered context package", async () => {
      const integration = fakeContextIntegration();
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await program.parseAsync(["node", "atlas", "claude", "fix", "the", "auth", "bug"]);
        expect(integration.launch).toHaveBeenCalledWith(
          expect.objectContaining({ task: "fix the auth bug", provider: "claude" }),
        );
        expect(integration.launch).toHaveBeenCalledWith(
          expect.not.objectContaining({ prompt: expect.anything() }),
        );
        expect(log.mock.calls.join(" ")).toContain("Session s1 started");
      } finally {
        log.mockRestore();
      }
    });

    it("prepends the AI briefing to the prompt with --ai", async () => {
      const integration = fakeContextIntegration({
        brief: vi.fn(async () => ok(aiBriefing())),
      });
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await program.parseAsync(["node", "atlas", "codex", "fix auth", "--ai"]);
        expect(integration.launch).toHaveBeenCalledWith(
          expect.objectContaining({
            task: "fix auth",
            provider: "codex",
            prompt: expect.stringContaining("Auth is handled in /src/auth.ts."),
          }),
        );
      } finally {
        log.mockRestore();
      }
    });

    it("still launches when the briefing fails", async () => {
      const integration = fakeContextIntegration();
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await program.parseAsync(["node", "atlas", "gemini", "fix auth", "--ai"]);
        expect(error.mock.calls.join(" ")).toContain("AI briefing unavailable");
        expect(integration.launch).toHaveBeenCalledWith(
          expect.not.objectContaining({ prompt: expect.anything() }),
        );
        expect(log.mock.calls.join(" ")).toContain("Session s1 started");
      } finally {
        log.mockRestore();
        error.mockRestore();
      }
    });

    it("emits the session as JSON with --json", async () => {
      const integration = fakeContextIntegration();
      const program = createCli({ integration });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await program.parseAsync(["node", "atlas", "opencode", "fix auth", "--json"]);
        expect(log.mock.calls.join(" ")).toContain('"id"');
        expect(log.mock.calls.join(" ")).toContain('"provider"');
      } finally {
        log.mockRestore();
      }
    });
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
      verifyPath: null,
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
          compatibility: null,
          conflicts: [],
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

  it("registers the complete agents command surface", () => {
    const program = createCli();
    const agents = program.commands.find((command) => command.name() === "agents");
    expect(agents?.commands.map((command) => command.name()).sort()).toEqual(["connect", "status"]);
  });

  it("renders agent MCP status and delegates connect through the injected façade", async () => {
    const agentMcp = fakeAgentMcp();
    const program = createCli({ agentMcp });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "atlas", "agents"]);
      expect(log.mock.calls.join("\n")).toContain("Claude");
      expect(log.mock.calls.join("\n")).toContain("registered");

      await program.parseAsync(["node", "atlas", "agents", "status", "--json"]);
      expect(() => JSON.parse(log.mock.calls[1]?.[0] as string)).not.toThrow();

      await program.parseAsync([
        "node",
        "atlas",
        "agents",
        "connect",
        "--target",
        "claude",
        "--dry-run",
      ]);
      expect(agentMcp.configureCalls).toEqual([{ dryRun: true, targets: ["claude"] }]);
    } finally {
      log.mockRestore();
    }
  });

  it("rejects an unknown agents connect target", async () => {
    const agentMcp = fakeAgentMcp();
    const program = createCli({ agentMcp });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const previousExitCode = process.exitCode;
    try {
      await program.parseAsync(["node", "atlas", "agents", "connect", "--target", "nope"]);
      expect(error).toHaveBeenCalledOnce();
    } finally {
      process.exitCode = previousExitCode;
      error.mockRestore();
    }
  });

  it("renders planned targets on a connect dry run", async () => {
    const agentMcp = fakeAgentMcp({
      configure: async () => ({
        ok: true as const,
        value: {
          toolName: "codeatlas",
          configHome: "/tmp",
          dryRun: true,
          appliedTargets: [],
          verifiedTargets: [],
          skippedTargets: [],
          failedTargets: [],
          targetChecks: [],
          changes: [
            {
              target: "claude",
              label: "Claude",
              filePath: "~/.claude/settings.json",
              fileExisted: false,
              preservedKeys: [],
              addedKeys: ["mcpServers.codeatlas"],
              mergedDocument: { mcpServers: { codeatlas: {} } },
              alreadyConfigured: false,
              problems: [],
              description: "Register codeatlas for Claude",
              backupPath: null,
              verified: null,
            },
          ],
        },
      }),
    });
    const program = createCli({ agentMcp });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync([
        "node",
        "atlas",
        "agents",
        "connect",
        "--target",
        "claude",
        "--dry-run",
      ]);
      expect(log.mock.calls.join("\n")).toContain("Would configure: claude");
      expect(log.mock.calls.join("\n")).not.toContain("No applicable");
    } finally {
      log.mockRestore();
    }
  });

  it("reports the CLI package version", () => {
    const program = createCli();
    expect(program.version()).toBe(pkg.version);
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

  describe("atlas search --ai", () => {
    it("renders AI summaries with overview, key points, and provider/model", () => {
      const rendered = renderSearchAI([
        { path: "/src/math.ts", summary: aiSummary("/src/math.ts") },
      ]);
      expect(rendered).toContain("AI summaries (top file hits):");
      expect(rendered).toContain("/src/math.ts (ollama/llama3.2):");
      expect(rendered).toContain("Overview of /src/math.ts");
      expect(rendered).toContain("point one");
    });

    it("marks cached summaries", () => {
      const summary = aiSummary("/src/math.ts");
      const rendered = renderSearchAI([
        {
          path: "/src/math.ts",
          summary: { ...summary, metadata: { ...summary.metadata, cacheHit: true } },
        },
      ]);
      expect(rendered).toContain("(cached)");
    });

    it("renders failure messages per file", () => {
      const rendered = renderSearchAI([
        { path: "/src/math.ts", message: "no provider configured" },
      ]);
      expect(rendered).toContain("/src/math.ts: no provider configured");
    });

    it("renders the empty case", () => {
      expect(renderSearchAI([])).toContain("no file hits");
    });

    it("uses a stored summary instead of generating", async () => {
      const generate = vi.fn(async () => fail(new Error("should not be called")));
      const context = fakeSearchContext({
        stored: () => aiSummary("/src/math.ts"),
        generate,
      });
      const entries = await buildSearchAI(context, [fileHit("/src/math.ts")]);
      expect(entries).toHaveLength(1);
      expect(entries[0].summary?.content.overview).toBe("Overview of /src/math.ts");
      expect(generate).not.toHaveBeenCalled();
    });

    it("generates a fresh summary when none is stored", async () => {
      const context = fakeSearchContext({
        generate: async () => ok(aiSummary("/src/math.ts")),
      });
      const entries = await buildSearchAI(context, [fileHit("/src/math.ts")]);
      expect(entries).toHaveLength(1);
      expect(entries[0].summary?.content.overview).toBe("Overview of /src/math.ts");
    });

    it("surfaces a generation failure as a message", async () => {
      const context = fakeSearchContext({
        generate: async () => fail(new Error("no provider configured")),
      });
      const entries = await buildSearchAI(context, [fileHit("/src/math.ts")]);
      expect(entries).toHaveLength(1);
      expect(entries[0].summary).toBeUndefined();
      expect(entries[0].message).toBe("no provider configured");
    });

    it("caps the number of summarized file hits", async () => {
      const context = fakeSearchContext({
        generate: async () => ok(aiSummary("x")),
      });
      const hits = Array.from({ length: 20 }, (_, index) => fileHit(`/src/file-${index}.ts`));
      const entries = await buildSearchAI(context, hits);
      expect(entries).toHaveLength(AI_SUMMARY_LIMIT);
    });

    it("renders the AI section through the CLI with an injected summary port", async () => {
      await withProject(async () => {
        const program = createCli({
          summary: {
            summarizeFile: async (file) => ok(aiSummary(file.path)),
            summarizeFolder: async () => fail(new Error("unused")),
            summarizeModule: async () => fail(new Error("unused")),
            summarizeProject: async () => fail(new Error("unused")),
          },
        });
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        let output = "";
        try {
          await program.parseAsync(["node", "atlas", "search", "double", "--ai"]);
          output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        } finally {
          log.mockRestore();
          error.mockRestore();
        }
        expect(output).toContain("AI summaries (top file hits):");
        expect(output).toContain("/src/math.ts (ollama/llama3.2):");
        expect(error).not.toHaveBeenCalled();
      });
    });
  });

  describe("atlas explain", () => {
    it("explains a symbol deterministically from a persisted index", async () => {
      await withProject(async () => {
        const program = createCli();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        let output = "";
        try {
          await program.parseAsync(["node", "atlas", "explain", "double"]);
          output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        } finally {
          log.mockRestore();
          error.mockRestore();
        }
        expect(output).toContain('Explanation for "double" (symbol)');
        expect(output).toContain("Symbol: double (function)");
        expect(output).toContain("/src/math.ts");
        expect(error).not.toHaveBeenCalled();
      });
    });

    it("explains a file by path", async () => {
      await withProject(async () => {
        const program = createCli();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        let output = "";
        try {
          await program.parseAsync(["node", "atlas", "explain", "/src/math.ts"]);
          output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        } finally {
          log.mockRestore();
        }
        expect(output).toContain("(file)");
        expect(output).toContain("/src/math.ts");
      });
    });

    it("outputs JSON when requested", async () => {
      await withProject(async () => {
        const program = createCli();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        let output = "";
        try {
          await program.parseAsync(["node", "atlas", "explain", "double", "--json"]);
          output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        } finally {
          log.mockRestore();
        }
        const parsed = JSON.parse(output) as { readonly kind: string; readonly symbol: unknown };
        expect(parsed.kind).toBe("symbol");
        expect(parsed.symbol).toBeDefined();
      });
    });

    it("fails cleanly when no index exists", async () => {
      const root = mkdtempSync(join(tmpdir(), "atlas-cli-explain-empty-"));
      process.env["ATLAS_ROOT"] = root;
      const previousExitCode = process.exitCode;
      try {
        const program = createCli();
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        let stderr = "";
        try {
          await program.parseAsync(["node", "atlas", "explain", "double"]);
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
  });

  describe("atlas doctor", () => {
    it("reports healthy when the index and services are in good shape", async () => {
      await withProject(async () => {
        const program = createCli({ doctor: fakeDoctorServices() });
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        let output = "";
        try {
          await program.parseAsync(["node", "atlas", "doctor"]);
          output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        } finally {
          log.mockRestore();
        }
        expect(output).toContain("[PASS] Node runtime");
        expect(output).toContain("[PASS] Context index");
        expect(output).toContain("[PASS] AI agents");
        expect(output).toContain("[PASS] Ollama");
        expect(process.exitCode).toBeUndefined();
      });
    });

    it("exits 1 when a check fails and prints JSON on request", async () => {
      await withProject(async () => {
        const program = createCli({
          doctor: fakeDoctorServices({
            providers: { status: () => [] },
            ollama: {
              status: () => ({
                connected: false,
                mode: "local",
                baseUrl: "",
                hasApiKey: false,
                keyDisplay: "",
                model: null,
              }),
            },
          }),
        });
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const previousExitCode = process.exitCode;
        let output = "";
        try {
          await program.parseAsync(["node", "atlas", "doctor", "--json"]);
          output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        } finally {
          process.exitCode = previousExitCode;
          log.mockRestore();
        }
        const parsed = JSON.parse(output) as {
          readonly healthy: boolean;
          readonly checks: readonly { readonly verdict: string }[];
        };
        expect(parsed.healthy).toBe(true);
        expect(parsed.checks.length).toBeGreaterThan(0);
      });
    });

    it("renders a human-readable report", () => {
      const rendered = renderDoctorReport({
        repositoryPath: "/tmp/project",
        checks: [
          { name: "Node runtime", verdict: "PASS", detail: "Node 22.9.0" },
          { name: "Context index", verdict: "FAIL", detail: "No index found" },
        ],
        healthy: false,
      });
      expect(rendered).toContain("[PASS] Node runtime");
      expect(rendered).toContain("[FAIL] Context index");
      expect(rendered).toContain("One or more checks failed");
    });
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

    it("computes the token impact and keeps saved unknown when either side is unknown", () => {
      const impact = computeSessionTokenImpact(
        { source: "actual", value: 1_200 },
        { source: "estimated", value: 10_000 },
      );
      expect(impact.burned).toEqual({ source: "actual", value: 1_200 });
      expect(impact.saved).toMatchObject({ source: "estimated", value: 8_800 });

      const unknownBurned = computeSessionTokenImpact(
        { source: "unknown", value: null },
        { source: "estimated", value: 10_000 },
      );
      expect(unknownBurned.saved.value).toBeNull();
      expect(unknownBurned.saved.source).toBe("unknown");

      const unknownBaseline = computeSessionTokenImpact(
        { source: "actual", value: 1_200 },
        { source: "unknown", value: null },
      );
      expect(unknownBaseline.saved.value).toBeNull();
    });

    it("renders the token impact report", () => {
      const rendered = renderSessionTokenImpact(
        computeSessionTokenImpact(
          { source: "actual", value: 1_200 },
          { source: "estimated", value: 10_000 },
        ),
      );
      expect(rendered).toContain("Token impact");
      expect(rendered).toContain("Burned:            1200");
      expect(rendered).toContain("Without CodeAtlas: 10000 (estimated)");
      expect(rendered).toContain("Saved:             8800 (estimated)");
    });

    it("reads burned tokens scoped to a session from the usage database", async () => {
      const root = mkdtempSync(join(tmpdir(), "atlas-session-burned-"));
      try {
        mkdirSync(join(root, ".codeatlas"), { recursive: true });
        const usage = createUsageService({ filePath: join(root, ".codeatlas", "usage.db") });
        await usage.record({
          source: "provider",
          provider: "claude",
          model: "claude-sonnet-5",
          sessionId: "a81f",
          latencyMs: 100,
          inputTokens: 500,
          outputTokens: 700,
          occurredAt: "2026-08-14T10:00:00.000Z",
        });
        await usage.record({
          source: "provider",
          provider: "claude",
          model: "claude-sonnet-5",
          sessionId: "a81f",
          latencyMs: 50,
          inputTokens: 100,
          outputTokens: 200,
          occurredAt: "2026-08-14T11:00:00.000Z",
        });
        usage.close();

        expect(sessionBurnedTokens(root, "a81f")).toMatchObject({
          source: "actual",
          value: 1_500,
        });
        expect(sessionBurnedTokens(root, "other")).toMatchObject({
          source: "unknown",
          value: null,
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("estimates the whole-repo baseline from indexed file sizes", () => {
      const baseline = wholeRepoBaselineTokens("/does/not/exist");
      expect(baseline).toMatchObject({ source: "unknown", value: null });
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

  it("prints the token impact when `atlas sessions stop` finishes a session", async () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sessions-stop-"));
    const dotAtlas = join(root, ".codeatlas");
    mkdirSync(dotAtlas, { recursive: true });

    const usage = createUsageService({ filePath: join(dotAtlas, "usage.db") });
    await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      sessionId: "a81f",
      latencyMs: 100,
      inputTokens: 500,
      outputTokens: 700,
      occurredAt: "2026-08-14T10:00:00.000Z",
    });
    usage.close();

    const stopped = session({
      id: "a81f",
      repositoryPath: root,
      status: "STOPPED",
      processId: undefined,
      startedAt: undefined,
      endedAt: 1_752_010_000_000,
      exitCode: 0,
    });
    const sessions: SessionPort = {
      createSession: () => ({ ok: false, error: new Error("not used") }),
      startSession: async () => ({ ok: false, error: new Error("not used") }),
      getSession: () => stopped,
      listSessions: () => [],
      getActiveSessions: () => [],
      getSessionOutput: () => undefined,
      stopSession: async () => ({ ok: true, value: stopped }),
      terminateSession: async () => ({ ok: true, value: stopped }),
      shutdown: async () => {},
    };

    const program = createCli({ sessions });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "atlas", "sessions", "stop", "a81f"]);
      const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(output).toContain("Stopping session a81f...");
      expect(output).toContain("✓ Session stopped");
      expect(output).toContain("Token impact");
      expect(output).toContain("Burned:");
      expect(output).toContain("Without CodeAtlas:");
      expect(output).toContain("Saved:");
    } finally {
      log.mockRestore();
      rmSync(root, { recursive: true, force: true });
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
      const ollamaKey = process.env["OLLAMA_API_KEY"];
      process.env["ATLAS_PROVIDERS_CONFIG"] = configPath();
      process.env["OLLAMA_API_KEY"] = "";
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
        process.env["OLLAMA_API_KEY"] = ollamaKey ?? "";
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

  describe("indexing commands", () => {
    function fakeSummaryPort(calls: string[]): SummaryPort {
      return {
        summarizeFile: async (file) => {
          calls.push(file.path);
          return ok(aiSummary(file.path));
        },
        summarizeFolder: async () => fail(new Error("not used")),
        summarizeModule: async () => fail(new Error("not used")),
        summarizeProject: async () => fail(new Error("not used")),
      };
    }

    function makeIndexProject(): { root: string; calls: string[] } {
      const root = mkdtempSync(join(tmpdir(), "atlas-cli-index-"));
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "math.ts"),
        "export function double(value: number) { return value * 2; }\n",
      );
      return { root, calls: [] };
    }

    it("generates AI summaries with `atlas build --summaries`", async () => {
      const { root, calls } = makeIndexProject();
      const program = createCli({ summary: fakeSummaryPort(calls) });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      let output = "";
      try {
        await program.parseAsync(["node", "atlas", "build", "--repo", root, "--summaries"]);
        output = log.mock.calls.map((call) => call.join(" ")).join("\n");
      } finally {
        log.mockRestore();
        rmSync(root, { recursive: true, force: true });
      }
      expect(calls).toHaveLength(1);
      expect(output).toContain("Summaries: 1 (0 failed)");
    });

    it("skips summaries without the flag", async () => {
      const { root, calls } = makeIndexProject();
      const program = createCli({ summary: fakeSummaryPort(calls) });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      let output = "";
      try {
        await program.parseAsync(["node", "atlas", "build", "--repo", root]);
        output = log.mock.calls.map((call) => call.join(" ")).join("\n");
      } finally {
        log.mockRestore();
        rmSync(root, { recursive: true, force: true });
      }
      expect(calls).toHaveLength(0);
      expect(output).not.toContain("Summaries:");
    });
  });
});
