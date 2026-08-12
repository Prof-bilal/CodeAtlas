import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  Budget,
  BudgetStatus,
  Symbol as CoreSymbol,
  Session,
  SourceFile,
  UsageRecord,
  UsageStatistics,
} from "@atlas/core";
import { createUsageService } from "@atlas/sdk";
import type { FilePath, SymbolId } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { describe, expect, it, vi } from "vitest";
import { createCli } from "../src/cli";
import { comingSoonMessage } from "../src/commands/coming-soon";
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
      "doctor",
      "explain",
      "init",
      "mcp",
      "search",
      "sessions",
      "tools",
      "update",
      "usage",
    ]);
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
});
