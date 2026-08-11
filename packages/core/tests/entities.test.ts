import type { EdgeId, FilePath, NodeId, ProjectId, SymbolId } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import type {
  ContextItem,
  GraphEdge,
  GraphNode,
  Project,
  SourceFile,
  Symbol,
} from "../src/domain/entities";

describe("core domain entities", () => {
  it("Project carries identity and location", () => {
    const project: Project = {
      id: "p1" as ProjectId,
      name: "CodeAtlas",
      rootPath: "/repo" as FilePath,
    };
    expect(project.name).toBe("CodeAtlas");
  });

  it("SourceFile carries language and content", () => {
    const file: SourceFile = {
      path: "/repo/src/index.ts" as FilePath,
      language: "typescript",
      content: "export const a = 1;",
    };
    expect(file.language).toBe("typescript");
    expect(file.content).toContain("a = 1");
  });

  it("Symbol records a normalized source span, parent, and visibility", () => {
    const symbol: Symbol = {
      id: "sym_1" as SymbolId,
      name: "makeContainer",
      kind: "function",
      filePath: "/repo/src/container.ts" as FilePath,
      location: { startLine: 10, endLine: 24, startColumn: 1, endColumn: 5 },
      parentId: null,
      visibility: "local",
      exported: false,
      modifiers: [],
      moduleSpecifier: null,
      typeText: null,
      documentation: "Builds the dependency container.",
    };
    expect(symbol.kind).toBe("function");
    expect(symbol.location.endLine - symbol.location.startLine).toBe(14);
    expect(symbol.visibility).toBe("local");
    expect(symbol.parentId).toBeNull();
    expect(symbol.documentation).toContain("container");
  });

  it("GraphEdge connects two nodes with a kind", () => {
    const from: GraphNode = { id: "n1" as NodeId, symbolId: "s1" as SymbolId };
    const to: GraphNode = { id: "n2" as NodeId, symbolId: "s2" as SymbolId };
    const edge: GraphEdge = {
      id: "e1" as EdgeId,
      from: from.id,
      to: to.id,
      kind: "calls",
    };
    expect(edge.from).toBe(from.id);
    expect(edge.kind).toBe("calls");
  });

  it("ContextItem carries a relevance score", () => {
    const item: ContextItem = {
      source: "/repo/src/main.ts" as FilePath,
      content: "import { x } from './y';",
      score: 0.95,
    };
    expect(item.score).toBeGreaterThan(0.9);
  });
});
