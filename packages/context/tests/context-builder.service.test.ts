import type { Symbol as CoreSymbol, SourceFile } from "@atlas/core";
import { SearchService } from "@atlas/search";
import type { FilePath, SymbolId } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { describe, expect, it } from "vitest";
import { ContextBuilderService } from "../src/context-builder.service";

function file(path: string, content: string): SourceFile {
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

function service(store: ContextStore): ContextBuilderService {
  return new ContextBuilderService({ search: new SearchService({ db: store }), db: store });
}

describe("ContextBuilderService", () => {
  it("builds ranked context items for a query, resolving hit content", async () => {
    const store = new ContextStore({ filePath: ":memory:" });
    store.saveContext({
      files: [file("/src/math.ts", "export function double(n: number): number { return n * 2; }")],
      symbols: [symbol("s1", "double", "/src/math.ts")],
    });
    const builder = service(store);
    const result = await builder.build("double");
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toHaveLength(1);
    expect(result.ok && result.value[0]).toEqual({
      source: "/src/math.ts",
      content: "export function double(n: number): number { return n * 2; }",
      score: result.ok ? result.value[0].score : 0,
    });
    expect(result.ok && result.value[0].score).toBeGreaterThan(0);
  });

  it("respects the limit when building context", async () => {
    const store = new ContextStore({ filePath: ":memory:" });
    store.saveContext({
      files: [
        file("/src/a.ts", "export const alpha = 1;"),
        file("/src/b.ts", "export const beta = 2;"),
      ],
      symbols: [symbol("a", "alpha", "/src/a.ts"), symbol("b", "beta", "/src/b.ts")],
    });
    const builder = service(store);
    const result = await builder.build("export const", 1);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toHaveLength(1);
  });

  it("skips hits without a resolvable file", async () => {
    const store = new ContextStore({ filePath: ":memory:" });
    store.saveContext({
      files: [file("/src/math.ts", "export function double(n: number): number { return n * 2; }")],
      symbols: [symbol("s1", "double", "/src/math.ts")],
      modules: [{ path: "/vendor", name: "external-pkg", moduleType: "package" }],
    });
    const builder = service(store);
    // A module hit carries a path that is not a stored file — skipped.
    const result = await builder.build("external-pkg");
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toHaveLength(0);
  });

  it("returns undefined for a missing sourceFile", async () => {
    const store = new ContextStore({ filePath: ":memory:" });
    store.saveContext({ files: [file("/src/math.ts", "export const n = 1;")] });
    const builder = service(store);
    const result = await builder.sourceFile("/src/other.ts" as FilePath);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBeUndefined();
  });

  it("returns a single context item for an indexed sourceFile", async () => {
    const store = new ContextStore({ filePath: ":memory:" });
    store.saveContext({ files: [file("/src/math.ts", "export const n = 1;")] });
    const builder = service(store);
    const result = await builder.sourceFile("/src/math.ts" as FilePath);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      source: "/src/math.ts",
      content: "export const n = 1;",
      score: 1,
    });
  });
});
