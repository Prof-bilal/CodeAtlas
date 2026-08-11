import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContextData, SourceFile, Summary, Symbol } from "@atlas/core";
import type { FilePath, NodeId, SymbolId } from "@atlas/shared";
import { createProjectContainer } from "@atlas/sdk";

export interface Fixture {
  readonly root: string;
  readonly dbPath: string;
  cleanup(): void;
}

/** Create a temp project root; the caller owns cleanup. */
function tempProjectRoot(): { readonly root: string; readonly dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), "atlas-ext-"));
  return { root, dbPath: join(root, ".codeatlas", "context.db") };
}

/** A temp project root that has no CodeAtlas index yet. */
export function createEmptyFixture(): Fixture {
  const { root, dbPath } = tempProjectRoot();
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
      generatedAt: "2026-08-09T00:00:00.000Z",
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

/** A standard two-file project with symbols, a module, dependencies, and summaries. */
export function standardData(): ContextData {
  return {
    files: [
      fixtureFile("/src/math.ts", "export function double(n: number) { return n * 2; }"),
      fixtureFile(
        "/src/auth.ts",
        "import { double } from './math';\nexport function login() { return double(2); }",
      ),
      fixtureFile("/README.md", "# Demo", "markdown"),
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
      fixtureSummary("file", "/src/math.ts", "Math utilities.", ["double", "MathUtils"]),
      fixtureSummary("module", "/src", "The src module.", ["math", "auth"]),
      fixtureSummary("project", "", "Demo project.", ["math", "auth"]),
    ],
  };
}

/** A temp project with a real `.codeatlas/context.db` populated from `data`. */
export function createFixture(data: ContextData = standardData()): Fixture {
  const { root, dbPath } = tempProjectRoot();
  mkdirSync(join(root, ".codeatlas"), { recursive: true });
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
