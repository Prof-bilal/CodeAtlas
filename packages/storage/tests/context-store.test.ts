import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Symbol as AtlasSymbol, SourceFile, Summary } from "@atlas/core";
import type { FilePath, NodeId, SymbolId } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { ContextStore } from "../src/context-store";

function file(path: string, content = "export const value = 1;"): SourceFile {
  return { path: path as FilePath, language: "typescript", content };
}

function symbol(symbolId: string, name: string, filePath: string): AtlasSymbol {
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

function summary(target: string): Summary {
  return {
    kind: "file",
    target,
    content: { overview: "Handles math.", keyPoints: ["Fast", "Tested"] },
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

describe("ContextStore", () => {
  it("saves and loads a full context (files, symbols, summaries, hashes, metadata)", () => {
    const store = new ContextStore();
    store.saveContext({
      files: [file("/a.ts"), file("/b.ts")],
      symbols: [symbol("s1", "run", "/a.ts")],
      summaries: [summary("/a.ts")],
      hashes: { "/a.ts": "abc", "/b.ts": "def" },
      metadata: { note: "hi" },
    });

    const snapshot = store.loadContext();
    expect(snapshot.version).toBe(1);
    expect(snapshot.savedAt).not.toBe("");
    expect(snapshot.files).toHaveLength(2);
    expect(snapshot.symbols).toHaveLength(1);
    expect(snapshot.symbols?.[0]?.filePath).toBe("/a.ts");
    expect(snapshot.symbols?.[0]?.name).toBe("run");
    expect(snapshot.summaries).toHaveLength(1);
    expect(snapshot.summaries?.[0]?.content.keyPoints).toEqual(["Fast", "Tested"]);
    expect(snapshot.hashes).toEqual({ "/a.ts": "abc", "/b.ts": "def" });
    expect(snapshot.metadata?.["note"]).toBe("hi");
    store.close();
  });

  it("saveContext replaces the context; updateContext merges", () => {
    const store = new ContextStore();
    store.saveContext({ files: [file("/a.ts"), file("/b.ts")] });
    store.saveContext({ files: [file("/c.ts")] });
    expect(store.loadContext().files).toHaveLength(1);

    store.updateContext({ files: [file("/d.ts")] });
    expect(store.loadContext().files).toHaveLength(2);
    store.close();
  });

  it("updateContext upserts by natural key without deleting others", () => {
    const store = new ContextStore();
    store.updateContext({ files: [file("/a.ts", "v1")] });
    store.updateContext({ files: [file("/a.ts", "v2"), file("/b.ts")] });
    const files = store.loadContext().files;
    expect(files).toHaveLength(2);
    expect(files?.find((f) => f.path === "/a.ts")?.content).toBe("v2");
    store.close();
  });

  it("deleteContext removes a file, its symbols, summaries, and dependency edges", () => {
    const store = new ContextStore();
    store.saveContext({
      files: [file("/a.ts"), file("/keep.ts")],
      symbols: [symbol("s1", "run", "/a.ts")],
      summaries: [summary("/a.ts")],
      dependencies: [
        { from: "n:file:/a.ts" as NodeId, to: "n:s1" as NodeId, kind: "calls" },
        { from: "n:file:/keep.ts" as NodeId, to: "n:other" as NodeId, kind: "calls" },
      ],
    });

    store.deleteContext({ kind: "file", path: "/a.ts" as FilePath });

    const snapshot = store.loadContext();
    expect(snapshot.files?.map((f) => f.path)).toEqual(["/keep.ts"]);
    expect(snapshot.symbols).toHaveLength(0); // cascaded file → symbols
    expect(snapshot.summaries).toHaveLength(0);
    expect(snapshot.dependencies).toHaveLength(1); // the keep.ts edge survives
    store.close();
  });

  it("deleteContext removes graph edges touching the deleted file's symbols", () => {
    const store = new ContextStore();
    store.saveContext({
      files: [file("/a.ts"), file("/keep.ts")],
      symbols: [symbol("s1", "run", "/a.ts")],
      dependencies: [
        { from: "n:file:/a.ts" as NodeId, to: "n:s1" as NodeId, kind: "calls" },
        { from: "n:s1" as NodeId, to: "n:file:/keep.ts" as NodeId, kind: "calls" },
        { from: "n:file:/keep.ts" as NodeId, to: "n:other" as NodeId, kind: "calls" },
      ],
    });

    store.deleteContext({ kind: "file", path: "/a.ts" as FilePath });

    const snapshot = store.loadContext();
    // Both edges that touch the deleted symbol node are gone; the unrelated
    // keep.ts edge survives. (Regression: symbol node ids were resolved after
    // the cascade, leaving these edges dangling.)
    expect(snapshot.dependencies).toEqual([
      { from: "n:file:/keep.ts" as NodeId, to: "n:other" as NodeId, kind: "calls" },
    ]);
    store.close();
  });

  it("deleteContext 'all' clears every table", () => {
    const store = new ContextStore();
    store.saveContext({ files: [file("/a.ts")], symbols: [symbol("s1", "run", "/a.ts")] });
    store.deleteContext({ kind: "all" });
    const snapshot = store.loadContext();
    expect(snapshot.files).toHaveLength(0);
    expect(snapshot.symbols).toHaveLength(0);
    store.close();
  });

  it("searchContext finds symbols, files, summaries, and modules", () => {
    const store = new ContextStore();
    store.saveContext({
      files: [file("/src/math.ts", "export function double() {}")],
      symbols: [symbol("s1", "double", "/src/math.ts")],
      summaries: [summary("/src/math.ts")],
      modules: [{ path: "/src", name: "src", moduleType: "folder" }],
    });

    const byName = store.searchContext("double");
    expect(byName.some((r) => r.kind === "symbol" && r.title === "double")).toBe(true);
    expect(byName.some((r) => r.kind === "file")).toBe(true); // path/content match

    const byOverview = store.searchContext("math");
    expect(byOverview.some((r) => r.kind === "summary")).toBe(true);

    const modulesOnly = store.searchContext("src", { types: ["module"] });
    expect(modulesOnly.every((r) => r.kind === "module")).toBe(true);

    const limited = store.searchContext("m", { limit: 1 });
    expect(limited.length).toBeLessThanOrEqual(1);
    store.close();
  });

  it("searchContext ranks exact matches above substring matches", () => {
    const store = new ContextStore();
    store.saveContext({ symbols: [symbol("s1", "parser", "/a.ts")] });
    const result = store.searchContext("parser");
    expect(result[0].kind).toBe("symbol");
    expect(result[0]?.score).toBe(100);
    store.close();
  });

  it("searchContext returns no hits for an empty query instead of dumping every row", () => {
    const store = new ContextStore();
    store.saveContext({
      files: [file("/a.ts", "export const a = 1;")],
      symbols: [symbol("s1", "run", "/a.ts")],
      summaries: [summary("/a.ts")],
      modules: [{ path: "/src", name: "src", moduleType: "folder" }],
    });
    expect(store.searchContext("")).toHaveLength(0);
    store.close();
  });

  it("searchContext scores case-insensitively, matching the LIKE filter", () => {
    const store = new ContextStore();
    store.saveContext({ symbols: [symbol("s1", "PaymentService", "/a.ts")] });
    // SQLite LIKE is case-insensitive, so the row matches; the scorer must not
    // produce a score-0 hit for the same query.
    const result = store.searchContext("payment");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.score).toBeGreaterThan(0);
    expect(result[0]?.title).toBe("PaymentService");
    store.close();
  });

  it("transaction rolls back all writes on error", () => {
    const store = new ContextStore();
    expect(() =>
      store.transaction(() => {
        store.updateContext({ files: [file("/a.ts")] });
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(store.loadContext().files).toHaveLength(0);
    store.close();
  });

  it("close() checkpoints the WAL so no -wal sibling remains", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-store-"));
    const dbPath = join(dir, "context.db");
    const store = new ContextStore({ filePath: dbPath });
    store.saveContext({ files: [file("/a.ts", "export const value = 1;")] });
    // A live WAL-mode connection holds the write-ahead log as a sibling file.
    expect(existsSync(`${dbPath}-wal`)).toBe(true);
    store.close();
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(dbPath)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("compact() reclaims pages after DELETE + re-insert cycles", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-store-"));
    const dbPath = join(dir, "context.db");
    const totalBytes = (): number =>
      readdirSync(dir).reduce((sum, name) => sum + statSync(join(dir, name)).size, 0);
    const store = new ContextStore({ filePath: dbPath });
    const data = { files: Array.from({ length: 200 }, (_, i) => file(`/src/file${i}.ts`)) };
    store.saveContext(data);
    store.compact();
    const before = totalBytes();
    // Repeated full replaces clear every row and re-insert it; without
    // compact() the file grows ~213KB per cycle as freed pages are never
    // reclaimed. compact() must keep the footprint flat (or shrinking).
    for (let i = 0; i < 5; i++) {
      store.saveContext(data);
      store.compact();
      expect(totalBytes()).toBeLessThanOrEqual(before);
    }
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
