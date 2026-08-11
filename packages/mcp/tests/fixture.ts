import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContextData, SourceFile, Summary, Symbol } from "@atlas/core";
import type { FilePath, NodeId, SymbolId } from "@atlas/shared";
import { createProjectContainer } from "@atlas/sdk";
import { createLogger, type Logger } from "../src/log";

export interface Fixture {
  readonly root: string;
  readonly dbPath: string;
  cleanup(): void;
}

/** A logger that never writes, for quiet tests. */
export function silentLogger(): Logger {
  const sink = { write: () => true } as unknown as NodeJS.WritableStream;
  return createLogger({ level: "error", stream: sink });
}

export function fixtureFile(path: string, content: string, language = "typescript"): SourceFile {
  return { path: path as FilePath, language, content };
}

export function fixtureSymbol(
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
    documentation: `Docs for ${name}.`,
  };
}

export function fixtureSummary(
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
      generatedAt: "2026-08-08T00:00:00.000Z",
      provider: "claude",
      model: "claude-sonnet-5",
      prompt: null,
      cacheHit: true,
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  };
}

/** A standard two-file project with symbols, dependencies, a module, and summaries. */
export function standardData(): ContextData {
  return {
    files: [
      fixtureFile("/src/math.ts", "export function double(x: number) { return x * 2; }"),
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
        from: "n:file:/src/auth.ts" as NodeId,
        to: "n:file:/src/math.ts" as NodeId,
        kind: "imports",
      },
      { from: "n:s2" as NodeId, to: "n:s1" as NodeId, kind: "calls" },
    ],
    modules: [{ path: "/src", name: "src", moduleType: "folder" }],
    summaries: [
      fixtureSummary("file", "/src/math.ts", "Math utilities for the project.", [
        "double",
        "MathUtils",
      ]),
      fixtureSummary("module", "/src", "The src module holds core utilities and auth.", [
        "math",
        "auth",
      ]),
      fixtureSummary("project", "", "CodeAtlas demo project.", ["math", "auth", "readme"]),
    ],
  };
}

/** Create a temp project directory with a real `.codeatlas/context.db`. */
export function createFixture(data: ContextData = standardData()): Fixture {
  const root = mkdtempSync(join(tmpdir(), "atlas-mcp-"));
  const dotAtlas = join(root, ".codeatlas");
  mkdirSync(dotAtlas, { recursive: true });
  const dbPath = join(dotAtlas, "context.db");

  const container = createProjectContainer(dbPath);
  try {
    container.getContextDb().saveContext(data);
  } finally {
    container.getContextDb().close();
  }

  return {
    root,
    dbPath,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; never mask the test result with a removal error.
      }
    },
  };
}
