import type {
  CachePort,
  ContextBuilderPort,
  GraphPort,
  ParserPort,
  ProviderPort,
  ScannerPort,
  StoragePort,
  Symbol,
} from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Container, createProjectContainer } from "../src/container";

function symbol(symbolId: string, name: string, filePath: string): Symbol {
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

describe("Container", () => {
  it("creates every service by default", () => {
    const container = Container.create();
    expect(container.getScanner()).toBeDefined();
    expect(container.getParser()).toBeDefined();
    expect(container.getStorage()).toBeDefined();
    expect(container.getGraph()).toBeDefined();
    expect(container.getContext()).toBeDefined();
    expect(container.getCache()).toBeDefined();
    expect(container.getProvider()).toBeDefined();
    expect(container.getSummary()).toBeDefined();
    expect(container.getContextDb()).toBeDefined();
    expect(container.getSearch()).toBeDefined();
  });

  it("honors custom implementations for any port", () => {
    const customProvider: ProviderPort = {
      complete: async () => ({ ok: true, value: { provider: "custom", content: "", model: "x" } }),
    };
    const container = Container.create({ provider: customProvider });
    expect(container.getProvider()).toBe(customProvider);
  });

  it("keeps service types assignable to their ports", () => {
    const container = Container.create();
    const scanner: ScannerPort = container.getScanner();
    const cache: CachePort = container.getCache();
    const graph: GraphPort = container.getGraph();
    const context: ContextBuilderPort = container.getContext();
    const parser: ParserPort = container.getParser();
    const storage: StoragePort = container.getStorage();
    expect([scanner, cache, graph, context, parser, storage]).toHaveLength(6);
  });

  it("wires search to the default in-memory context database", () => {
    const container = Container.create();
    container.getContextDb().saveContext({ symbols: [symbol("s1", "double", "/src/math.ts")] });

    const search = container.getSearch();
    expect(search.refresh().ok).toBe(true);
    const hits = search.search("double");
    expect(hits.some((h) => h.kind === "symbol" && h.title === "double")).toBe(true);
  });

  it("createProjectContainer opens an on-disk context database", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-container-"));
    const dbPath = join(root, "context.db");
    const container = createProjectContainer(dbPath);
    try {
      expect(container.getSearch().refresh().ok).toBe(true);
      expect(container.getContextDb().loadContext().files).toHaveLength(0);
    } finally {
      container.getContextDb().close();
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; never mask the test result with a removal error.
      }
    }
  });
});
