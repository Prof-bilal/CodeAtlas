import type { ContextData, SourceFile, Symbol } from "@atlas/core";
import type { ContextSDK } from "../src/index";
import type { FilePath, NodeId, SymbolId } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { describe, expect, it } from "vitest";
import { createContextSDK } from "../src/index";

function fixtureFile(path: string, content: string): SourceFile {
  return { path: path as FilePath, language: "typescript", content };
}

function fixtureSymbol(id: string, name: string, filePath: string): Symbol {
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
  };
}

/** Chain a -> b -> c so depth:2 reaches c from a but depth:1 does not. */
function chainData(): ContextData {
  return {
    files: [fixtureFile("/a.ts", "a"), fixtureFile("/b.ts", "b"), fixtureFile("/c.ts", "c")],
    symbols: [
      fixtureSymbol("sa", "aFn", "/a.ts"),
      fixtureSymbol("sb", "bFn", "/b.ts"),
      fixtureSymbol("sc", "cFn", "/c.ts"),
    ],
    dependencies: [
      { from: "n:file:/a.ts" as NodeId, to: "n:file:/b.ts" as NodeId, kind: "imports" },
      { from: "n:file:/b.ts" as NodeId, to: "n:file:/c.ts" as NodeId, kind: "imports" },
    ],
  };
}

function withSdk(data: ContextData, fn: (sdk: ContextSDK) => void): void {
  const sdk = createContextSDK({ contextDb: new ContextStore({ filePath: ":memory:" }) });
  sdk.write.save(data);
  try {
    fn(sdk);
  } finally {
    sdk.close();
  }
}

describe("DependencyQuery depth (Phase 4)", () => {
  it("depth 1 returns only direct edges with hop/path", () => {
    withSdk(chainData(), (sdk) => {
      const result = sdk.dependencies.query({
        node: "/a.ts",
        direction: "outgoing",
        depth: 1,
      });
      expect(result.depth).toBe(1);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]?.to).toBe("n:file:/b.ts");
      expect(result.edges[0]?.hop).toBe(1);
      expect(result.edges[0]?.path).toEqual(["n:file:/a.ts", "n:file:/b.ts"]);
    });
  });

  it("depth 2 traverses two hops with path attribution", () => {
    withSdk(chainData(), (sdk) => {
      const result = sdk.dependencies.query({
        node: "/a.ts",
        direction: "outgoing",
        depth: 2,
      });
      expect(result.depth).toBe(2);
      expect(result.edges).toHaveLength(2);
      const hops = result.edges.map((e) => e.hop);
      expect(hops).toEqual([1, 2]);
      expect(result.edges[1]?.path).toEqual(["n:file:/a.ts", "n:file:/b.ts", "n:file:/c.ts"]);
    });
  });

  it("clamps depth to 1..3 and is cycle-safe", () => {
    withSdk(chainData(), (sdk) => {
      const clamped = sdk.dependencies.query({
        node: "/a.ts",
        direction: "outgoing",
        depth: 99,
      });
      expect(clamped.depth).toBe(3);
    });
    // No infinite loop on cyclic input: a->b->a terminates.
    const cyclic: ContextData = {
      ...chainData(),
      dependencies: [
        { from: "n:file:/a.ts" as NodeId, to: "n:file:/b.ts" as NodeId, kind: "imports" },
        { from: "n:file:/b.ts" as NodeId, to: "n:file:/a.ts" as NodeId, kind: "imports" },
      ],
    };
    withSdk(cyclic, (sdk) => {
      const r = sdk.dependencies.query({
        node: "/a.ts",
        direction: "outgoing",
        depth: 3,
      });
      expect(r.edges.length).toBeLessThanOrEqual(6);
    });
  });
});
