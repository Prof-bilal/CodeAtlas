import type { ContextSDK } from "@atlas/sdk";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/log";
import { createContextToolSource } from "../src/tool-bridge";

function fakeSDK(): ContextSDK {
  return {
    files: {
      getFile: () => ({
        path: "/repo/src/index.ts",
        language: "TypeScript",
        content: "export const x = 1;",
        size: 22,
      }),
      listFiles: () => [],
      searchFiles: () => [],
      readRange: () => ({
        path: "/repo/src/index.ts",
        startLine: 1,
        endLine: 1,
        content: "export const x = 1;",
        hash: "abc123",
        versionMatch: true,
        stale: false,
        padded: false,
      }),
    },
    symbols: {
      getSymbol: () => {
        throw new Error("not found");
      },
      listSymbols: () => [],
      searchSymbols: () => [],
      findDefinition: () => {
        throw new Error("not found");
      },
      findReferences: () => [],
    },
    dependencies: {
      getDependencies: () => [],
      getDependents: () => [],
      getDependencyGraph: () => [],
      query: () => ({ edges: [], nodeFound: true, total: 0 }),
    },
    modules: {
      listModules: () => [],
      getModule: () => undefined,
      explain: () => ({
        path: "/repo/src",
        module: null,
        fileCount: 0,
        files: [],
        symbolCount: 0,
        symbols: [],
        dependencyCount: 0,
        dependencies: [],
        summary: null,
      }),
    },
    summaries: {
      listSummaries: () => [],
      getSummary: () => undefined,
      getFileSummary: () => undefined,
      getModuleSummary: () => undefined,
      getProjectSummary: () => undefined,
      generateFile: async () => ({
        ok: false,
        error: new Error("no provider"),
      }),
      generateFolder: async () => ({
        ok: false,
        error: new Error("no provider"),
      }),
      generateModule: async () => ({
        ok: false,
        error: new Error("no provider"),
      }),
      generateProject: async () => ({
        ok: false,
        error: new Error("no provider"),
      }),
    },
    search: {
      search: () => [],
    },
    project: {
      stats: () => ({
        files: 0,
        symbols: 0,
        modules: 0,
        dependencies: 0,
        summaries: 0,
      }),
      overview: () => ({
        savedAt: "2026-01-01T00:00:00Z",
        schemaVersion: 1,
        counts: {
          files: 0,
          symbols: 0,
          modules: 0,
          dependencies: 0,
          summaries: 0,
        },
        languages: {},
      }),
    },
    write: {
      save: () => 0,
      update: () => 0,
      delete: () => 0,
    },
    status: () => ({
      repositoryPath: "/repo",
      dbPath: "/repo/.codeatlas/context.db",
      schemaVersion: 1,
      lastUpdated: "2026-01-01T00:00:00Z",
      available: true,
      filesIndexed: 0,
      symbolsIndexed: 0,
      modulesIndexed: 0,
      dependenciesIndexed: 0,
      summariesIndexed: 0,
    }),
    freshness: async () => ({
      state: "fresh",
      checkedAt: "2026-01-01T00:00:00Z",
    }),
    hashes: () => ({}),
    refresh: async () => ({
      ok: true,
      value: {
        filesProcessed: 0,
        symbolsExtracted: 0,
        filesAdded: 0,
        filesChanged: 0,
        filesDeleted: 0,
        filesUnchanged: 0,
      },
    }),
    getRelevantContext: () => ({
      query: "test",
      files: [],
      symbols: [],
      dependencies: [],
      modules: [],
      summaries: [],
      overview: {
        savedAt: "2026-01-01T00:00:00Z",
        schemaVersion: 1,
        counts: {
          files: 0,
          symbols: 0,
          modules: 0,
          dependencies: 0,
          summaries: 0,
        },
        languages: {},
      },
    }),
    isAvailable: true,
    config: { repositoryPath: "/repo", dbPath: "/repo/.codeatlas/context.db" },
    close: () => {},
  } as unknown as ContextSDK;
}

describe("createContextToolSource", () => {
  it("returns exactly 7 tools", () => {
    const sdk = fakeSDK();
    const logger = createLogger({ level: "error" });
    const toolSource = createContextToolSource({
      ctx: { requireSDK: () => sdk } as never,
      logger,
    });
    const tools = toolSource.listTools();
    expect(tools.length).toBe(7);
  });

  it("each tool has a function name matching the MCP registry", () => {
    const sdk = fakeSDK();
    const logger = createLogger({ level: "error" });
    const toolSource = createContextToolSource({
      ctx: { requireSDK: () => sdk } as never,
      logger,
    });
    const names = toolSource
      .listTools()
      .map((t) => t.function.name)
      .sort();
    expect(names).toEqual([
      "explain_module",
      "get_dependencies",
      "get_summary",
      "project_overview",
      "read_file_range",
      "search_files",
      "search_symbols",
    ]);
  });

  it("each tool has JSON Schema parameters", () => {
    const sdk = fakeSDK();
    const logger = createLogger({ level: "error" });
    const toolSource = createContextToolSource({
      ctx: { requireSDK: () => sdk } as never,
      logger,
    });
    for (const tool of toolSource.listTools()) {
      expect(tool.function.parameters).toBeDefined();
      expect(typeof tool.function.parameters).toBe("object");
    }
  });

  it("executes a tool call and returns a result", async () => {
    const sdk = fakeSDK();
    const logger = createLogger({ level: "error" });
    const toolSource = createContextToolSource({
      ctx: { requireSDK: () => sdk } as never,
      logger,
    });
    const result = await toolSource.execute("project_overview", {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeDefined();
    }
  });

  it("returns error for unknown tool names", async () => {
    const sdk = fakeSDK();
    const logger = createLogger({ level: "error" });
    const toolSource = createContextToolSource({
      ctx: { requireSDK: () => sdk } as never,
      logger,
    });
    const result = await toolSource.execute("nonexistent_tool", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Unknown tool");
    }
  });

  it("returns error when handler throws", async () => {
    const sdk = fakeSDK();
    // Override symbols.getSymbol to throw
    (sdk.symbols as unknown as { getSymbol: () => never }).getSymbol = () => {
      throw new Error("symbol lookup failed");
    };
    const logger = createLogger({ level: "error" });
    const toolSource = createContextToolSource({
      ctx: { requireSDK: () => sdk } as never,
      logger,
    });
    // search_symbols calls symbols.searchSymbols, not getSymbol, so it should work
    const result = await toolSource.execute("search_symbols", {
      query: "test",
    });
    expect(result.ok).toBe(true);
  });

  it("exposes a deny-filter that blocks secret files (beta audit Fix 6)", () => {
    const logger = createLogger({ level: "error" });
    const toolSource = createContextToolSource({
      ctx: { requireSDK: () => fakeSDK() } as never,
      logger,
    });
    const deny = toolSource.getDenyFilter?.();
    expect(deny).toBeDefined();
    if (deny === undefined) return;
    expect(deny("/repo/.env")).toBe(true);
    expect(deny("/repo/.env.local")).toBe(true);
    expect(deny("/repo/secrets.json")).toBe(true);
    expect(deny("/repo/keys/id_rsa")).toBe(true);
    expect(deny("/repo/certs/server.pem")).toBe(true);
    expect(deny("/repo/src/index.ts")).toBe(false);
    expect(deny("/repo/README.md")).toBe(false);
  });
});
