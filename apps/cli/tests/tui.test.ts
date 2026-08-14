import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentInfo,
  AgentPort,
  ContextIntegration,
  ContextPackage,
  ContextSDK,
  ContextStatus,
  InstallOutcome,
  InstallPlan,
  OllamaConnectResult,
  OllamaService,
  OllamaStatus,
  SearchResult,
  Session,
  SessionPort,
  ToolkitSDK,
} from "@atlas/sdk";
import type { Result } from "@atlas/shared";
import { describe, expect, it, vi } from "vitest";
import type { TuiIo } from "../src/tui/io";
import {
  contextStateLabel,
  renderAgents,
  renderHeader,
  renderHelp,
  renderManualInstall,
  renderToolkitSidebar,
  sessionSummary,
} from "../src/tui/render";
import { parseCommandLine } from "../src/tui/router";
import { type TuiDeps, dispatch, renderIndexResult, runTui } from "../src/tui/shell";

function fakeIo(lines: readonly string[] = []): { io: TuiIo; written: string[] } {
  const written: string[] = [];
  let index = 0;
  return {
    written,
    io: {
      write: (text) => {
        written.push(text);
      },
      readLine: async () => {
        const line = lines[index] ?? "";
        index += 1;
        return line;
      },
      suspend: () => {},
      resume: () => {},
      close: () => {},
    },
  };
}

function fakeContext(overrides: Partial<ContextStatus> = {}): ContextSDK {
  return {
    status: () => ({
      repositoryPath: "/tmp/repo",
      dbPath: "/tmp/repo/.codeatlas/context.db",
      schemaVersion: 1,
      lastUpdated: "",
      available: true,
      filesIndexed: 3,
      symbolsIndexed: 5,
      modulesIndexed: 0,
      dependenciesIndexed: 0,
      summariesIndexed: 0,
      ...overrides,
    }),
    search: { search: () => [] },
    close: () => {},
  } as unknown as ContextSDK;
}

interface FakeSessions extends SessionPort {
  startCalls: unknown[];
  createCalls: unknown[];
}

function fakeSessions(options: { exitImmediately?: boolean } = {}): FakeSessions {
  const store = new Map<string, Session>();
  const startCalls: unknown[] = [];
  const createCalls: unknown[] = [];
  const exitImmediately = options.exitImmediately ?? true;
  const port: SessionPort = {
    createSession: (request) => {
      createCalls.push(request);
      const session: Session = {
        id: `s-${store.size + 1}`,
        agentId: request.provider as Session["agentId"],
        provider: request.provider,
        repositoryPath: request.repositoryPath,
        status: "CREATED",
        processId: undefined,
        startedAt: undefined,
        endedAt: undefined,
        exitCode: undefined,
        error: undefined,
      };
      store.set(session.id, session);
      return { ok: true, value: session };
    },
    startSession: async (sessionId, launch) => {
      startCalls.push(launch);
      const current = store.get(sessionId);
      if (current === undefined) {
        return { ok: false, error: new Error("unknown session") };
      }
      const next: Session = exitImmediately
        ? { ...current, status: "STOPPED", processId: 999, startedAt: 1, endedAt: 1, exitCode: 0 }
        : { ...current, status: "RUNNING", processId: 999, startedAt: 1 };
      store.set(sessionId, next);
      return { ok: true, value: next };
    },
    getSession: (sessionId) => store.get(sessionId),
    listSessions: () => [...store.values()],
    getActiveSessions: () =>
      [...store.values()].filter(
        (s) => s.status === "STARTING" || s.status === "RUNNING" || s.status === "STOPPING",
      ),
    getSessionOutput: () => undefined,
    stopSession: async () => ({ ok: false, error: new Error("fixture") }),
    terminateSession: async () => ({ ok: false, error: new Error("fixture") }),
    shutdown: async () => {},
  };
  return Object.assign(port, { startCalls, createCalls });
}

function fakeAgents(detections: Readonly<Record<string, AgentInfo>>): AgentPort {
  return {
    defaultProvider: "claude",
    listAgents: () => Object.keys(detections),
    detectAgent: async (provider) =>
      detections[provider] === undefined
        ? { ok: false, error: new Error("unknown provider") }
        : { ok: true, value: detections[provider] },
    detectAll: async () => ({ ok: true, value: Object.values(detections) }),
    run: async () => ({ ok: false, error: new Error("no run in TUI") }),
  } as AgentPort;
}

function availableAgent(provider: string): AgentInfo {
  return {
    provider,
    binary: provider,
    available: true,
    path: `/usr/bin/${provider}`,
    version: "1.0.0",
  };
}

const PLAN: InstallPlan = {
  toolName: "biome",
  method: "npm",
  command: { binary: "npm", args: ["install", "--global", "biome"], cwd: null },
  uninstallCommand: null,
  effect: "install biome",
  dangerous: ["global install", "network access"],
  verifyBinary: "biome",
  security: {
    toolName: "biome",
    checks: [],
    risk: "medium",
    status: "unverified",
    trust: "unverified",
    note: "fixture",
    assessedAt: "2026-08-13T00:00:00.000Z",
    overrideRequired: true,
  },
};

const OUTCOME: InstallOutcome = {
  plan: PLAN,
  verification: "verified",
  verificationNote: "biome found on PATH",
  exitCode: 0,
  rollback: "none",
  recordedAt: "2026-08-13T00:00:00.000Z",
  log: [],
  manifestPath: "/tmp/repo/.codeatlas/tools/biome.json",
};

function fakeToolkit(overrides: Partial<ToolkitSDK> = {}): ToolkitSDK {
  return {
    registry: {} as ToolkitSDK["registry"],
    overview: async () => ({
      ok: true,
      value: {
        recommended: [{ name: "ripgrep", description: "fast grep" }],
        installed: [{ name: "biome", security: { trust: "community" } }],
      },
    }),
    search: () => [],
    info: async () => ({ ok: false, error: new Error("fixture") }),
    planInstall: async () => ({ ok: true, value: PLAN }),
    install: async () => ({ ok: true, value: OUTCOME }),
    remove: async () => ({ ok: false, error: new Error("fixture") }),
    update: async () => ({ ok: false, error: new Error("fixture") }),
    doctor: async () => ({ ok: false, error: new Error("fixture") }),
    configure: async () => ({ ok: false, error: new Error("fixture") }),
    ...overrides,
  } as unknown as ToolkitSDK;
}

function minimalPackage(task: string): ContextPackage {
  return {
    task,
    items: [
      {
        id: "file:src/a.ts",
        kind: "file",
        title: "src/a.ts",
        path: "src/a.ts",
        content: "export const a = 1;",
        score: 1,
        source: "search",
        reason: "matched",
        truncated: false,
        tokens: 5,
      },
    ],
    staleness: {
      state: "fresh",
      available: true,
      lastUpdated: "2026-08-13T00:00:00.000Z",
      changed: [],
      added: [],
      deleted: [],
    },
    budget: {
      budget: { maxItems: 20, maxTokensPerItem: 2000, maxTokensTotal: 12000 },
      itemsRequested: 1,
      itemsIncluded: 1,
      tokensEstimated: 5,
      itemsDroppedByCount: [],
      itemsTruncated: [],
      droppedByTokens: [],
      budgetExceeded: false,
    },
    exclusions: { droppedPaths: [], droppedPatterns: [] },
  };
}

function fakeOllama(overrides: Partial<OllamaService> = {}): OllamaService {
  const status: OllamaStatus = {
    connected: false,
    mode: "local",
    baseUrl: "http://localhost:11434",
    hasApiKey: false,
    keyDisplay: "",
    model: null,
  };
  return {
    status: () => status,
    connect: async () => ({
      ok: true,
      value: { status: { ...status, connected: true }, models: ["llama3.2"] },
    }),
    disconnect: () => {},
    listModels: async () => ({ ok: true, value: ["llama3.2"] }),
    use: () => ({ ...status, model: "llama3.2" }),
    overview: () => ({
      providers: [
        { name: "ollama", configured: false, hasApiKey: false, model: null, defaultModel: null },
      ],
      defaultProvider: "claude",
      defaultModel: null,
    }),
    ...overrides,
  };
}

function makeDeps(options: { withDb?: boolean } = {}): TuiDeps & {
  sessions: FakeSessions;
  agents: AgentPort;
  toolkit: ToolkitSDK;
  integration: ContextIntegration;
  context: ContextSDK;
  ollama: OllamaService;
} {
  const root = mkdtempSync(join(tmpdir(), "atlas-tui-"));
  const dbPath = join(root, ".codeatlas", "context.db");
  if (options.withDb === true) {
    mkdirSync(join(root, ".codeatlas"), { recursive: true });
    writeFileSync(dbPath, "");
  }
  const context = fakeContext();
  const sessions = fakeSessions();
  const agents = fakeAgents({
    claude: availableAgent("claude"),
    gemini: { provider: "gemini", binary: "gemini", available: false },
  });
  const toolkit = fakeToolkit();
  const integration = {
    buildPackage: vi.fn(async () => minimalPackage("fix auth")),
    explain: vi.fn(),
    launch: vi.fn(),
    attach: vi.fn(),
  } as unknown as ContextIntegration;
  const ollama = fakeOllama();
  return { root, dbPath, context, integration, toolkit, sessions, agents, ollama };
}

describe("tui/router — parseCommandLine", () => {
  it("maps empty and whitespace input to the empty command", () => {
    expect(parseCommandLine("")).toEqual({ kind: "empty" });
    expect(parseCommandLine("   ")).toEqual({ kind: "empty" });
  });

  it("parses simple slash commands", () => {
    expect(parseCommandLine("/help")).toEqual({ kind: "help" });
    expect(parseCommandLine("/status")).toEqual({ kind: "status" });
    expect(parseCommandLine("/scan")).toEqual({ kind: "scan" });
    expect(parseCommandLine("/agents")).toEqual({ kind: "agents" });
    expect(parseCommandLine("/toolkit")).toEqual({ kind: "toolkit" });
    expect(parseCommandLine("/exit")).toEqual({ kind: "exit" });
    expect(parseCommandLine("/quit")).toEqual({ kind: "exit" });
  });

  it("keeps the whole query for /search and /context", () => {
    expect(parseCommandLine("/search fix auth bug")).toEqual({
      kind: "search",
      query: "fix auth bug",
    });
    expect(parseCommandLine("/context  how does auth work ")).toEqual({
      kind: "context",
      task: "how does auth work",
    });
  });

  it("parses /tools-install with the tool name", () => {
    expect(parseCommandLine("/tools-install biome")).toEqual({
      kind: "tools-install",
      tool: "biome",
    });
  });

  it("routes known agent providers with their args", () => {
    expect(parseCommandLine("/claude --foo bar")).toEqual({
      kind: "agent",
      provider: "claude",
      args: ["--foo", "bar"],
    });
    expect(parseCommandLine("/gemini")).toEqual({ kind: "agent", provider: "gemini", args: [] });
    expect(parseCommandLine("/cursor")).toEqual({ kind: "agent", provider: "cursor", args: [] });
    expect(parseCommandLine("/grok")).toEqual({ kind: "agent", provider: "grok", args: [] });
    expect(parseCommandLine("/opencode")).toEqual({
      kind: "agent",
      provider: "opencode",
      args: [],
    });
    expect(parseCommandLine("/codex")).toEqual({ kind: "agent", provider: "codex", args: [] });
  });

  it("parses /providers and /ollama actions", () => {
    expect(parseCommandLine("/providers")).toEqual({ kind: "providers" });
    expect(parseCommandLine("/ollama")).toEqual({ kind: "ollama", action: null, args: [] });
    expect(parseCommandLine("/ollama connect")).toEqual({
      kind: "ollama",
      action: "connect",
      args: [],
    });
    expect(parseCommandLine("/ollama disconnect")).toEqual({
      kind: "ollama",
      action: "disconnect",
      args: [],
    });
    expect(parseCommandLine("/ollama models")).toEqual({
      kind: "ollama",
      action: "models",
      args: [],
    });
    expect(parseCommandLine("/ollama use llama3.2")).toEqual({
      kind: "ollama",
      action: "use",
      args: ["llama3.2"],
    });
  });

  it("marks anything else as unknown", () => {
    expect(parseCommandLine("/nope")).toEqual({ kind: "unknown", raw: "/nope" });
    expect(parseCommandLine("hello world")).toEqual({ kind: "unknown", raw: "hello world" });
  });
});

describe("tui/render", () => {
  it("renders the header with repository label and context state", () => {
    const header = renderHeader({ repoLabel: "AIbuilder", contextState: "Ready" });
    expect(header).toContain("AIbuilder");
    expect(header).toContain("Ready");
    expect(header).toContain("CodeAtlas");
  });

  it("labels available vs unavailable context statuses", () => {
    expect(contextStateLabel(fakeContext().status())).toContain("3 files");
    expect(contextStateLabel(fakeContext({ available: false }).status())).toContain("Not built");
  });

  it("renders help with the core commands", () => {
    const help = renderHelp();
    expect(help).toContain("/scan");
    expect(help).toContain("/search <query>");
    expect(help).toContain("/context <task>");
    expect(help).toContain("/toolkit");
    expect(help).toContain("/exit");
  });

  it("renders installed vs missing agents", () => {
    const text = renderAgents([
      availableAgent("claude"),
      { provider: "gemini", binary: "gemini", available: false },
    ]);
    expect(text).toContain("claude");
    expect(text).toContain("✓ installed");
    expect(text).toContain("✗ not installed");
  });

  it("renders the toolkit sidebar with installed and recommended", () => {
    const text = renderToolkitSidebar(
      [{ name: "biome", note: "community" }],
      [{ name: "ripgrep", note: "fast grep" }],
    );
    expect(text).toContain("Toolkit");
    expect(text).toContain("✓ biome");
    expect(text).toContain("• ripgrep");
    expect(text).toContain("/tools-install");
  });

  it("renders manual install guidance with the vendor commands", () => {
    const text = renderManualInstall({
      label: "Grok Build (xAI)",
      commands: ["curl -fsSL https://x.ai/cli/install.sh | bash"],
      verify: "grok --version",
    });
    expect(text).toContain("x.ai");
    expect(text).toContain("grok --version");
  });

  it("pluralizes the session summary", () => {
    expect(sessionSummary(0)).toBe("0 active sessions");
    expect(sessionSummary(1)).toBe("1 active session");
  });
});

describe("tui/shell — dispatch", () => {
  it("writes help for /help", async () => {
    const deps = makeDeps();
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/help"), deps, io);
    expect(written.join("\n")).toContain("/scan");
  });

  it("reports a missing index for /search before it exists", async () => {
    const deps = makeDeps();
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/search auth"), deps, io);
    expect(written.join(" ")).toContain("No context index yet");
  });

  it("searches through the Context SDK when an index exists", async () => {
    const deps = makeDeps({ withDb: true });
    const hits = [{ kind: "symbol", title: "authenticate", path: "src/auth.ts", score: 1 }];
    (deps.context.search as unknown as { search: () => readonly SearchResult[] }).search = vi.fn(
      () => hits as unknown as readonly SearchResult[],
    );
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/search authenticate"), deps, io);
    expect(written.join("\n")).toContain("authenticate");
  });

  it("requires a query for /search", async () => {
    const deps = makeDeps({ withDb: true });
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/search"), deps, io);
    expect(written.join(" ")).toContain("Usage: /search");
  });

  it("assembles and renders a context package for /context", async () => {
    const deps = makeDeps({ withDb: true });
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/context fix auth"), deps, io);
    expect(deps.integration.buildPackage).toHaveBeenCalledWith({ task: "fix auth" });
    expect(written.join("\n")).toContain("fix auth");
    expect(written.join("\n")).toContain("src/a.ts");
  });

  it("requires a task for /context", async () => {
    const deps = makeDeps({ withDb: true });
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/context"), deps, io);
    expect(written.join(" ")).toContain("Usage: /context");
  });

  it("lists agents for /agents", async () => {
    const deps = makeDeps();
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/agents"), deps, io);
    expect(written.join("\n")).toContain("✓ installed");
  });

  it("renders the toolkit sidebar for /toolkit", async () => {
    const deps = makeDeps();
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/toolkit"), deps, io);
    expect(written.join("\n")).toContain("Toolkit");
    expect(written.join("\n")).toContain("biome");
  });

  it("cancels /tools-install when the user declines", async () => {
    const deps = makeDeps();
    const install = vi.fn(async () => ({ ok: true as const, value: OUTCOME }));
    deps.toolkit = fakeToolkit({ install });
    const { io, written } = fakeIo(["n"]);
    await dispatch(parseCommandLine("/tools-install biome"), deps, io);
    expect(install).not.toHaveBeenCalled();
    expect(written.join(" ")).toContain("Install cancelled.");
  });

  it("approves /tools-install and records the outcome", async () => {
    const deps = makeDeps();
    const install = vi.fn(async () => ({ ok: true as const, value: OUTCOME }));
    deps.toolkit = fakeToolkit({ install });
    const { io, written } = fakeIo(["y"]);
    await dispatch(parseCommandLine("/tools-install biome"), deps, io);
    expect(install).toHaveBeenCalledWith("biome", { granted: true });
    expect(written.join("\n")).toContain("Installed biome");
    expect(written.join("\n")).toContain("verified");
  });

  it("suggests the Toolkit install for a missing catalog agent", async () => {
    const deps = makeDeps();
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/gemini"), deps, io);
    expect(written.join("\n")).toContain("not installed");
    expect(written.join("\n")).toContain("/tools-install gemini");
  });

  it("renders the unified provider overview for /providers", async () => {
    const deps = makeDeps();
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/providers"), deps, io);
    expect(written.join("\n")).toContain("AI Providers");
    expect(written.join("\n")).toContain("ollama");
    expect(written.join("\n")).toContain("Default provider");
  });

  it("renders Ollama status for bare /ollama", async () => {
    const deps = makeDeps();
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/ollama"), deps, io);
    expect(written.join("\n")).toContain("Ollama");
    expect(written.join("\n")).toContain("Not connected");
  });

  it("connects Ollama locally from /ollama connect", async () => {
    const deps = makeDeps();
    const connect = vi.fn(
      async (): Promise<Result<OllamaConnectResult>> => ({
        ok: true,
        value: {
          status: {
            connected: true,
            mode: "local",
            baseUrl: "http://localhost:11434",
            hasApiKey: false,
            keyDisplay: "",
            model: "llama3.2",
          },
          models: ["llama3.2"],
        },
      }),
    );
    deps.ollama = fakeOllama({ connect });
    const { io, written } = fakeIo([""]);
    await dispatch(parseCommandLine("/ollama connect"), deps, io);
    expect(connect).toHaveBeenCalledWith({ saveKey: true });
    expect(written.join("\n")).toContain("Connected");
  });

  it("disconnects Ollama from /ollama disconnect", async () => {
    const deps = makeDeps();
    const disconnect = vi.fn();
    deps.ollama = fakeOllama({ disconnect });
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/ollama disconnect"), deps, io);
    expect(disconnect).toHaveBeenCalled();
    expect(written.join(" ")).toContain("disconnected");
  });

  it("lists Ollama models from /ollama models", async () => {
    const deps = makeDeps();
    const listModels = vi.fn(async () => ({ ok: true as const, value: ["llama3.2", "qwen3"] }));
    deps.ollama = fakeOllama({ listModels });
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/ollama models"), deps, io);
    expect(listModels).toHaveBeenCalled();
    expect(written.join("\n")).toContain("llama3.2");
    expect(written.join("\n")).toContain("qwen3");
  });

  it("selects a model from /ollama use", async () => {
    const deps = makeDeps();
    const use = vi.fn(
      (): OllamaStatus => ({
        connected: true,
        mode: "local",
        baseUrl: "http://localhost:11434",
        hasApiKey: false,
        keyDisplay: "",
        model: "qwen3",
      }),
    );
    deps.ollama = fakeOllama({ use });
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/ollama use qwen3"), deps, io);
    expect(use).toHaveBeenCalledWith("qwen3");
    expect(written.join("\n")).toContain("qwen3");
  });

  it("shows vendor install guidance for a manual agent", async () => {
    const deps = makeDeps();
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/cursor"), deps, io);
    expect(written.join("\n")).toContain("cursor.com");
  });

  it("launches an installed agent interactively and hands the terminal back", async () => {
    const deps = makeDeps();
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/claude --foo"), deps, io);
    expect(deps.sessions.startCalls).toEqual([{ interactive: true, args: ["--foo"] }]);
    expect(written.join("\n")).toContain("Launching Claude");
    expect(written.join("\n")).toContain("Claude exited");
  });

  it("reports unknown commands", async () => {
    const deps = makeDeps();
    const { io, written } = fakeIo();
    await dispatch(parseCommandLine("/nope"), deps, io);
    expect(written.join(" ")).toContain("Unknown command");
  });
});

describe("tui/shell — runTui", () => {
  it("renders the header, handles a command, and exits cleanly", async () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-tui-run-"));
    const context = fakeContext();
    const sessions = fakeSessions();
    const agents = fakeAgents({ claude: availableAgent("claude") });
    const toolkit = fakeToolkit();
    const integration = {
      buildPackage: vi.fn(async () => minimalPackage("fix auth")),
      explain: vi.fn(),
      launch: vi.fn(),
      attach: vi.fn(),
    } as unknown as ContextIntegration;
    const { io, written } = fakeIo(["/help", "/exit"]);
    await runTui({
      root,
      context,
      sessions,
      agents,
      toolkit,
      integration,
      io,
    });
    expect(written[0]).toContain("CodeAtlas");
    expect(written.join("\n")).toContain("/search <query>");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("tui/shell — renderIndexResult", () => {
  it("summarizes an index run", () => {
    const text = renderIndexResult({
      repositoryPath: "/tmp/repo",
      dbPath: "/tmp/repo/.codeatlas/context.db",
      mode: "build",
      files: 10,
      parsedFiles: 8,
      skippedFiles: 2,
      symbols: 42,
      dependencies: 7,
      added: 10,
      changed: 0,
      deleted: 0,
      unchanged: 0,
      manifestPath: "/tmp/repo/.codeatlas/context.json",
    });
    expect(text).toContain("symbols: 42");
    expect(text).toContain("added 10");
  });
});
