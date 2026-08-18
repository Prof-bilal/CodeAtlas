import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// biome-ignore lint/suspicious/noShadowRestrictedNames: domain Symbol type, not the JS global
import type { ContextData, MetricsPort, SourceFile, Summary, Symbol } from "@atlas/core";
import type { FilePath, NodeId, SymbolId } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { describe, expect, it } from "vitest";
import {
  type ContextSDK,
  ContextUnavailableError,
  FileNotFoundError,
  InvalidQueryError,
  SymbolNotFoundError,
  createContextSDK,
} from "../src/index";

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

/** A two-file project mirroring the docs' examples. */
function standardData(): ContextData {
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
      {
        from: "n:s2" as NodeId,
        to: "n:s1" as NodeId,
        kind: "calls",
      },
      {
        from: "n:file:/src/auth.ts" as NodeId,
        to: "n:file:/src/math.ts" as NodeId,
        kind: "imports",
      },
    ],
    modules: [{ path: "/src", name: "src", moduleType: "folder" }],
    summaries: [
      fixtureSummary("file", "/src/math.ts", "Math utilities for the project.", [
        "double",
        "MathUtils",
      ]),
      fixtureSummary("module", "/src", "The src module holds math and auth.", ["math", "auth"]),
      fixtureSummary("project", "", "CodeAtlas demo project.", ["math", "auth", "readme"]),
    ],
  };
}

/** Create an in-memory SDK populated with the standard fixture, plus a cleanup. */
function withSdk(fn: (sdk: ContextSDK) => void): void {
  const sdk = createContextSDK({ contextDb: new ContextStore({ filePath: ":memory:" }) });
  sdk.write.save(standardData());
  try {
    fn(sdk);
  } finally {
    sdk.close();
  }
}

describe("Context SDK — initialization", () => {
  it("creates an SDK that reports availability and config", () => {
    withSdk((sdk) => {
      expect(sdk.isAvailable).toBe(true);
      expect(sdk.config.dbPath).toBeTruthy();
      expect(sdk.config.repositoryPath).toBeTruthy();
      expect(typeof sdk.files.listFiles).toBe("function");
    });
  });

  it("is unavailable when the database file does not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-sdk-missing-"));
    try {
      const sdk = createContextSDK({ repositoryPath: join(root, "no", "index") });
      expect(sdk.isAvailable).toBe(false);
      expect(sdk.status().available).toBe(false);
      expect(() => sdk.files.listFiles()).toThrow(ContextUnavailableError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Context SDK — file queries", () => {
  it("getFile returns content plus file metadata", () => {
    withSdk((sdk) => {
      const file = sdk.files.getFile("/src/math.ts");
      expect(file.path).toBe("/src/math.ts");
      expect(file.language).toBe("typescript");
      expect(file.size).toBeGreaterThan(0);
      expect(file.content).toContain("double");
    });
  });

  it("throws FileNotFoundError for a missing file", () => {
    withSdk((sdk) => {
      expect(() => sdk.files.getFile("/src/missing.ts")).toThrow(FileNotFoundError);
    });
  });

  it("listFiles enumerates every indexed file", () => {
    withSdk((sdk) => {
      const files = sdk.files.listFiles();
      expect(files.map((file) => file.path).sort()).toEqual([
        "/README.md",
        "/src/auth.ts",
        "/src/math.ts",
      ]);
    });
  });

  it("searchFiles returns file hits for a query", () => {
    withSdk((sdk) => {
      const hits = sdk.files.searchFiles("math");
      expect(hits.some((hit) => hit.kind === "file" && hit.title === "/src/math.ts")).toBe(true);
    });
  });

  it("rejects empty file queries", () => {
    withSdk((sdk) => {
      expect(() => sdk.files.searchFiles("   ")).toThrow(InvalidQueryError);
    });
  });
});

describe("Context SDK — symbol queries", () => {
  it("getSymbol returns a symbol by id", () => {
    withSdk((sdk) => {
      const symbol = sdk.symbols.getSymbol("s1");
      expect(symbol.name).toBe("double");
      expect(symbol.filePath).toBe("/src/math.ts");
    });
  });

  it("throws SymbolNotFoundError for a missing symbol", () => {
    withSdk((sdk) => {
      expect(() => sdk.symbols.getSymbol("missing")).toThrow(SymbolNotFoundError);
    });
  });

  it("searchSymbols finds a symbol by name and can filter by kind", () => {
    withSdk((sdk) => {
      const hits = sdk.symbols.searchSymbols("double");
      expect(hits.some((hit) => hit.kind === "symbol" && hit.title === "double")).toBe(true);

      const classes = sdk.symbols.searchSymbols("MathUtils", { kind: "class" });
      expect(classes.some((hit) => hit.title === "MathUtils")).toBe(true);
      expect(sdk.symbols.searchSymbols("double", { kind: "class" })).toEqual([]);
    });
  });

  it("findDefinition returns the declaration", () => {
    withSdk((sdk) => {
      const definition = sdk.symbols.findDefinition("s1");
      expect(definition.name).toBe("double");
      expect(definition.location.startLine).toBe(1);
    });
  });

  it("findReferences resolves symbols that reference a target", () => {
    withSdk((sdk) => {
      const references = sdk.symbols.findReferences("s1");
      expect(references.length).toBeGreaterThan(0);
      const login = references.find((ref) => ref.symbol.name === "login");
      expect(login?.kind).toBe("calls");
      expect(login?.targetId).toBe("s1");
    });
  });
});

describe("Context SDK — dependency queries", () => {
  it("getDependencies returns edges where the target is the source", () => {
    withSdk((sdk) => {
      const deps = sdk.dependencies.getDependencies("login");
      const edge = deps.find((dep) => dep.toLabel.startsWith("double"));
      expect(edge?.kind).toBe("calls");
    });
  });

  it("getDependents returns edges where the target is the destination", () => {
    withSdk((sdk) => {
      const dependents = sdk.dependencies.getDependents("double");
      const edge = dependents.find((dep) => dep.fromLabel.startsWith("login"));
      expect(edge?.kind).toBe("calls");
    });
  });

  it("getDependencyGraph resolves labels for every edge", () => {
    withSdk((sdk) => {
      const graph = sdk.dependencies.getDependencyGraph();
      expect(graph.length).toBe(2);
      const edge = graph.find((dep) => dep.kind === "imports");
      expect(edge?.fromLabel).toBe("/src/auth.ts");
      expect(edge?.toLabel).toBe("/src/math.ts");
    });
  });
});

describe("Context SDK — module queries", () => {
  it("listModules returns every module", () => {
    withSdk((sdk) => {
      const modules = sdk.modules.listModules();
      expect(modules).toHaveLength(1);
      expect(modules[0]?.path).toBe("/src");
    });
  });

  it("getModule finds a module by path and returns undefined otherwise", () => {
    withSdk((sdk) => {
      expect(sdk.modules.getModule("/src")?.name).toBe("src");
      expect(sdk.modules.getModule("/other")).toBeUndefined();
    });
  });
});

describe("Context SDK — summary queries", () => {
  it("getFileSummary / getModuleSummary / getProjectSummary return stored summaries", () => {
    withSdk((sdk) => {
      expect(sdk.summaries.getFileSummary("/src/math.ts")?.content.overview).toContain(
        "Math utilities",
      );
      expect(sdk.summaries.getModuleSummary("/src")?.content.overview).toContain("src module");
      expect(sdk.summaries.getProjectSummary()?.content.overview).toContain("demo project");
      expect(sdk.summaries.getFileSummary("/src/auth.ts")).toBeUndefined();
    });
  });
});

describe("Context SDK — search", () => {
  it("search returns ranked results across kinds", () => {
    withSdk((sdk) => {
      const hits = sdk.search.search("double");
      expect(hits.some((hit) => hit.kind === "symbol" && hit.title === "double")).toBe(true);
      expect(hits.some((hit) => hit.kind === "file" && hit.title === "/src/math.ts")).toBe(true);
    });
  });

  it("search filters by type and honors an empty-query guard", () => {
    withSdk((sdk) => {
      const symbols = sdk.search.search("src", { types: ["module"] });
      expect(symbols.some((hit) => hit.kind === "module")).toBe(true);
      expect(() => sdk.search.search("  ")).toThrow(InvalidQueryError);
    });
  });
});

describe("Context SDK — metrics recording", () => {
  it("records search, read-range, and context requests when a metrics port is wired", () => {
    const recorded: string[] = [];
    const metrics: MetricsPort = {
      snapshot: () => ({}) as never,
      recordScan: () => recorded.push("scan"),
      recordSearch: () => recorded.push("search"),
      recordContextRequest: () => recorded.push("context"),
      recordMcpRequest: () => recorded.push("mcp"),
      recordFileRead: () => recorded.push("read"),
      recordFileModified: () => recorded.push("modified"),
      recordTokenEstimate: () => recorded.push("tokens"),
      flush: () => undefined,
      reset: () => undefined,
      close: () => undefined,
    };
    const sdk = createContextSDK({
      contextDb: new ContextStore({ filePath: ":memory:" }),
      metrics,
    });
    try {
      sdk.write.save(standardData());
      sdk.search.search("double");
      sdk.files.readRange("/src/math.ts", { startLine: 1, endLine: 1 });
      sdk.getRelevantContext("math");
    } finally {
      sdk.close();
    }
    expect(recorded).toContain("search");
    expect(recorded).toContain("read");
    expect(recorded).toContain("context");
  });

  it("records nothing when no metrics port is wired", () => {
    const sdk = createContextSDK({ contextDb: new ContextStore({ filePath: ":memory:" }) });
    try {
      sdk.write.save(standardData());
      expect(() => sdk.search.search("double")).not.toThrow();
    } finally {
      sdk.close();
    }
  });
});

describe("Context SDK — project overview & status", () => {
  it("stats reports entity counts", () => {
    withSdk((sdk) => {
      const stats = sdk.project.stats();
      expect(stats.files).toBe(3);
      expect(stats.symbols).toBe(3);
      expect(stats.dependencies).toBe(2);
      expect(stats.modules).toBe(1);
      expect(stats.summaries).toBe(3);
    });
  });

  it("overview includes languages, counts, schema version, and the project summary", () => {
    withSdk((sdk) => {
      const overview = sdk.project.overview();
      expect(overview.languages["typescript"]).toBe(2);
      expect(overview.languages["markdown"]).toBe(1);
      expect(overview.counts.files).toBe(3);
      expect(overview.schemaVersion).toBeGreaterThanOrEqual(1);
      expect(overview.summary?.content.overview).toContain("demo project");
    });
  });

  it("status exposes staleness metadata", () => {
    withSdk((sdk) => {
      const status = sdk.status();
      expect(status.available).toBe(true);
      expect(status.filesIndexed).toBe(3);
      expect(status.symbolsIndexed).toBe(3);
      expect(status.summariesIndexed).toBe(3);
      expect(status.schemaVersion).toBeGreaterThanOrEqual(1);
      expect(status.lastUpdated.length).toBeGreaterThan(0);
    });
  });
});

describe("Context SDK — relevant context", () => {
  it("assembles deterministic relevant context for a query", () => {
    withSdk((sdk) => {
      const relevant = sdk.getRelevantContext("double");
      expect(relevant.query).toBe("double");
      expect(relevant.files.length).toBeGreaterThan(0);
      expect(relevant.symbols.length).toBeGreaterThan(0);
      expect(relevant.dependencies.length).toBeGreaterThan(0);
      expect(relevant.modules.length).toBeGreaterThan(0);
      expect(relevant.summaries.length).toBeGreaterThan(0);
      expect(relevant.overview.counts.files).toBe(3);
    });
  });

  it("rejects empty relevant-context queries", () => {
    withSdk((sdk) => {
      expect(() => sdk.getRelevantContext("   ")).toThrow(InvalidQueryError);
    });
  });
});

describe("Context SDK — write edge (indexing pipeline)", () => {
  it("update merges new entities without removing the rest", () => {
    withSdk((sdk) => {
      sdk.write.update({ files: [fixtureFile("/src/extra.ts", "export const extra = 1;")] });
      const files = sdk.files.listFiles();
      expect(files.map((file) => file.path)).toContain("/src/extra.ts");
      expect(files).toHaveLength(4);
    });
  });

  it("delete removes a file by path", () => {
    withSdk((sdk) => {
      sdk.write.delete({ kind: "file", path: "/src/auth.ts" as FilePath });
      expect(() => sdk.files.getFile("/src/auth.ts")).toThrow(FileNotFoundError);
      expect(sdk.files.listFiles()).toHaveLength(2);
    });
  });
});

describe("Context SDK — repository/database separation", () => {
  it("does not expose database internals on the public surface", () => {
    withSdk((sdk) => {
      // The SDK façade is the only interface; raw DB access methods never leak.
      const publicNames = Object.keys(sdk);
      expect(publicNames).not.toContain("loadContext");
      expect(publicNames).not.toContain("saveContext");
      expect(publicNames).not.toContain("searchContext");
      expect(typeof sdk.files.getFile).toBe("function");
      expect(typeof sdk.search.search).toBe("function");

      // The façade exposes the documented sub-APIs, not SQLite handles.
      const surface = sdk as unknown as Record<string, unknown>;
      for (const exposed of [
        "files",
        "symbols",
        "dependencies",
        "modules",
        "summaries",
        "search",
        "write",
      ]) {
        expect(surface[exposed]).toBeTypeOf("object");
      }
    });
  });

  it("surfaces errors as typed Context SDK errors, not raw driver errors", () => {
    withSdk((sdk) => {
      try {
        sdk.files.getFile("/nope.ts");
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(FileNotFoundError);
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});
