import type {
  ContextSnapshot,
  PersistedDependency,
  PersistedModule,
  Symbol as PersistedSymbol,
  SourceFile,
  Summary,
} from "@atlas/core";
import type { FilePath, NodeId, SymbolId } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { describe, expect, it } from "vitest";
import { LexicalScorer, type RelevanceScorer } from "../src/scoring";
import { SearchService } from "../src/search.service";

function file(path: string, content = ""): SourceFile {
  return { path: path as FilePath, language: "typescript", content };
}

function symbol(
  id: string,
  name: string,
  filePath: string,
  overrides: Partial<PersistedSymbol> = {},
): PersistedSymbol {
  return {
    id: id as SymbolId,
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
    ...overrides,
  };
}

function summary(target: string, overview = "Handles math."): Summary {
  return {
    kind: "file",
    target,
    content: { overview, keyPoints: ["Fast", "Tested"] },
    metadata: {
      generatedAt: "2026-08-08T00:00:00.000Z",
      provider: "claude",
      model: "claude-sonnet-5",
      prompt: null,
      cacheHit: false,
      durationMs: 12,
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    },
  };
}

function moduleRecord(path: string, name = path): PersistedModule {
  return { path, name, moduleType: "folder" };
}

function dependency(from: string, to: string, kind = "imports"): PersistedDependency {
  return { from: from as NodeId, to: to as NodeId, kind };
}

function snapshot(overrides: Partial<ContextSnapshot> = {}): ContextSnapshot {
  return {
    version: 1,
    savedAt: "2026-08-08T00:00:00.000Z",
    files: [
      file("/src/math.ts", "export function double() {}"),
      file("/src/auth.ts", "export function login() {}"),
    ],
    symbols: [
      symbol("s1", "double", "/src/math.ts"),
      symbol("s2", "middleware", "/src/auth.ts"),
      symbol("s3", "UserService", "/src/user-service.ts", {
        documentation: "Authenticates users.",
      }),
    ],
    modules: [moduleRecord("/src")],
    dependencies: [dependency("n:file:/src/auth.ts", "n:file:/src/math.ts")],
    summaries: [summary("/src/math.ts")],
    ...overrides,
  };
}

describe("SearchService", () => {
  it("indexes a snapshot and counts every entity", () => {
    const service = new SearchService();
    service.indexSnapshot(snapshot());
    // 2 files + 3 symbols + 1 module + 1 dependency + 1 summary
    expect(service.size).toBe(8);
  });

  it("finds symbols by exact name and ranks them at 100", () => {
    const service = new SearchService();
    service.indexSnapshot(snapshot());
    const hits = service.search("double");
    expect(hits[0]).toMatchObject({ kind: "symbol", title: "double", score: 100 });
  });

  it("finds files by basename and modules by name", () => {
    const service = new SearchService();
    service.indexSnapshot(snapshot());

    const fileHits = service.search("auth.ts");
    expect(fileHits.some((h) => h.kind === "file" && h.title === "/src/auth.ts")).toBe(true);

    const moduleHits = service.search("src", { types: ["module"] });
    expect(moduleHits.some((h) => h.kind === "module" && h.title === "/src")).toBe(true);
  });

  it("finds summaries by overview text and attaches a snippet", () => {
    const service = new SearchService();
    service.indexSnapshot(snapshot());
    const hits = service.search("math", { types: ["summary"] });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({ kind: "summary" });
    expect(hits[0]?.snippet).toContain("math");
  });

  it("finds dependencies through resolved node labels", () => {
    const service = new SearchService();
    service.indexSnapshot(snapshot());
    const hits = service.search("math", { types: ["dependency"] });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({ kind: "dependency", relation: "imports" });
    expect(hits[0]?.title).toContain("/src/math.ts");
  });

  it("matches typos via fuzzy search", () => {
    const service = new SearchService();
    service.indexSnapshot(snapshot());
    const hits = service.search("mideleware"); // typo for middleware
    expect(hits.some((h) => h.kind === "symbol" && h.title === "middleware")).toBe(true);
  });

  it("ranks an exact name above a prefix match", () => {
    const service = new SearchService();
    service.indexSnapshot(
      snapshot({
        symbols: [
          symbol("s1", "double", "/src/math.ts"),
          symbol("s2", "doubleHelper", "/src/math.ts"),
        ],
      }),
    );
    const hits = service.search("double");
    expect(hits[0]).toMatchObject({ title: "double", score: 100 });
    expect(hits[1]).toMatchObject({ title: "doubleHelper" });
  });

  it("ranks a definition above equal-score import/re-export references", () => {
    const service = new SearchService();
    service.indexSnapshot(
      snapshot({
        symbols: [
          symbol("s1", "createUserRoutes", "/src/api/index.ts", { kind: "export" }),
          symbol("s2", "createUserRoutes", "/src/index.ts", { kind: "import" }),
          symbol("s3", "createUserRoutes", "/src/api/routes.ts"),
        ],
      }),
    );
    const hits = service.search("createUserRoutes");
    expect(hits[0]).toMatchObject({ path: "/src/api/routes.ts" });
    expect(hits).toHaveLength(3);
  });

  it("honors limit, minScore, and empty queries", () => {
    const service = new SearchService();
    service.indexSnapshot(snapshot());

    expect(service.search("", { limit: 5 })).toHaveLength(0);

    const limited = service.search("double", { limit: 1 });
    expect(limited.length).toBeLessThanOrEqual(1);

    const filtered = service.search("double", { minScore: 90 });
    expect(filtered).toHaveLength(1);
  });

  it("disables fuzzy matching when requested", () => {
    const service = new SearchService();
    service.indexSnapshot(snapshot());
    const hits = service.search("mideleware", { fuzzy: false });
    expect(hits.some((h) => h.kind === "symbol" && h.title === "middleware")).toBe(false);
  });

  it("loads a snapshot from a backing context database via refresh", () => {
    const store = new ContextStore();
    store.saveContext({
      files: [file("/src/math.ts", "export function double() {}")],
      symbols: [symbol("s1", "double", "/src/math.ts")],
    });

    const service = new SearchService({ db: store });
    expect(service.refresh().ok).toBe(true);
    expect(service.size).toBe(2);

    const hits = service.search("double");
    expect(hits.some((h) => h.kind === "symbol" && h.title === "double")).toBe(true);
    store.close();
  });

  it("refresh fails when no backing store is configured", () => {
    const service = new SearchService();
    expect(service.refresh().ok).toBe(false);
  });

  it("routes scoring through an injectable relevance scorer (vector-search seam)", () => {
    const customScorer: RelevanceScorer = {
      score: (_query, entity, _fuzzy) => (entity.kind === "symbol" ? 77 : 0),
    };
    const service = new SearchService({ scorer: customScorer });
    service.indexSnapshot(snapshot());

    const hits = service.search("anything");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.kind === "symbol")).toBe(true);
    expect(hits[0]).toMatchObject({ score: 77 });
  });

  it("defaults to the lexical scorer", () => {
    const service = new SearchService();
    expect(service).toBeInstanceOf(SearchService);
    expect(
      new LexicalScorer().score(
        "double",
        {
          kind: "symbol",
          id: "s1",
          name: "double",
          symbolKind: "function",
          filePath: "/src/math.ts",
          documentation: null,
        },
        true,
      ),
    ).toBe(100);
  });

  it("matches multi-word queries by their best meaningful term", () => {
    const service = new SearchService();
    service.indexSnapshot(snapshot());

    // "authenticate" (from the UserService documentation) and "login" (from
    // auth.ts content) each match through the best-term rule.
    const hits = service.search("authenticate users please", {
      types: ["symbol", "file"],
    });
    expect(hits.some((h) => h.kind === "symbol" && h.title === "UserService")).toBe(true);

    const fileHits = service.search("login handler where?", { types: ["file"] });
    expect(fileHits.some((h) => h.kind === "file" && h.title === "/src/auth.ts")).toBe(true);
  });

  it("ignores stopwords so a task sentence never matches unrelated symbols", () => {
    const service = new SearchService();
    service.indexSnapshot(
      snapshot({
        symbols: [symbol("s1", "isActive", "/src/ui.ts"), symbol("s2", "double", "/src/math.ts")],
      }),
    );
    // "is" (stopword) must not prefix-match isActive.
    const hits = service.search("where is the double function", { types: ["symbol"] });
    expect(hits.some((h) => h.title === "isActive")).toBe(false);
    expect(hits.some((h) => h.title === "double")).toBe(true);
  });
});
