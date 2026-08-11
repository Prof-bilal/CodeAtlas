import type { GraphEdge, Symbol, SymbolKind } from "@atlas/core";
import type { FilePath, NodeId } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { GraphService } from "../src/graph.service";
import { fileNodeId, symbolNodeId } from "../src/ids";
import { indexFixture } from "./helpers";

/** Build the graph for the shared shapes/circle/main fixture. */
async function buildFixture() {
  const fixture = await indexFixture([
    [
      "/src/shapes.ts",
      `export interface Shape { area(): number; }
export class Base { kind = "base"; }
export function scale(n: number): number { return n * 2; }`,
    ],
    [
      "/src/circle.ts",
      `import { Base, Shape, scale } from "./shapes";
export class Circle extends Base implements Shape {
  area(): number { return scale(2); }
}`,
    ],
    [
      "/src/main.ts",
      `import { Circle } from "./circle";
const c = new Circle();
c.area();`,
    ],
  ]);
  const service = new GraphService().build(fixture.symbols, fixture.references);
  return { fixture, service };
}

function symbolId(
  fixture: Awaited<ReturnType<typeof buildFixture>>["fixture"],
  name: string,
  kind: SymbolKind,
): Symbol {
  return fixture.indexer.listSymbols({ name, kind })[0];
}

describe("GraphService", () => {
  it("builds nodes for every symbol and file", async () => {
    const { fixture, service } = await buildFixture();
    const shape = symbolId(fixture, "Shape", "interface");
    const circle = symbolId(fixture, "Circle", "class");
    const result = await service.exportJson();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const payload = JSON.parse(result.value) as {
      nodes: { id: NodeId; symbolId: Symbol["id"] | null }[];
    };
    const ids = payload.nodes.map((node) => node.id);
    expect(ids).toContain(symbolNodeId(shape.id));
    expect(ids).toContain(symbolNodeId(circle.id));
    expect(ids).toContain(fileNodeId("/src/shapes.ts" as FilePath));
    expect(ids).toContain(fileNodeId("/src/main.ts" as FilePath));
  });

  it("emits extends, implements, calls, imports, exports, and contains edges", async () => {
    const { fixture, service } = await buildFixture();
    const shapesFile = fileNodeId("/src/shapes.ts" as FilePath);
    const circleFile = fileNodeId("/src/circle.ts" as FilePath);
    const mainFile = fileNodeId("/src/main.ts" as FilePath);

    const shape = symbolId(fixture, "Shape", "interface");
    const base = symbolId(fixture, "Base", "class");
    const circle = symbolId(fixture, "Circle", "class");
    const area = fixture.indexer
      .listSymbols({ name: "area", kind: "method" })
      .find((s) => s.parentId === circle.id)!;
    const importBase = symbolId(fixture, "Base", "import");
    const importShape = symbolId(fixture, "Shape", "import");
    const importScale = symbolId(fixture, "scale", "import");
    const importCircle = symbolId(fixture, "Circle", "import");
    const c = symbolId(fixture, "c", "constant");

    const result = await service.exportJson();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const payload = JSON.parse(result.value) as { edges: GraphEdge[] };
    const keys = new Set(payload.edges.map((edge) => `${edge.from}>${edge.to}#${edge.kind}`));

    // Class inheritance and interface implementation.
    expect(keys.has(`${symbolNodeId(circle.id)}>${symbolNodeId(importBase.id)}#extends`)).toBe(
      true,
    );
    expect(keys.has(`${symbolNodeId(circle.id)}>${symbolNodeId(importShape.id)}#implements`)).toBe(
      true,
    );
    // Function calls (same-file resolution through the import binding).
    expect(keys.has(`${symbolNodeId(area.id)}>${symbolNodeId(importScale.id)}#calls`)).toBe(true);
    expect(keys.has(`${symbolNodeId(c.id)}>${symbolNodeId(importCircle.id)}#constructs`)).toBe(
      true,
    );
    // Import binding -> definition, and module dependency file -> file.
    expect(keys.has(`${symbolNodeId(importBase.id)}>${symbolNodeId(base.id)}#imports`)).toBe(true);
    expect(keys.has(`${symbolNodeId(importCircle.id)}>${symbolNodeId(circle.id)}#imports`)).toBe(
      true,
    );
    expect(keys.has(`${circleFile}>${shapesFile}#imports`)).toBe(true);
    expect(keys.has(`${mainFile}>${circleFile}#imports`)).toBe(true);
    // Exports and structural containment.
    expect(keys.has(`${shapesFile}>${symbolNodeId(shape.id)}#exports`)).toBe(true);
    expect(keys.has(`${circleFile}>${symbolNodeId(circle.id)}#exports`)).toBe(true);
    expect(keys.has(`${symbolNodeId(circle.id)}>${symbolNodeId(area.id)}#contains`)).toBe(true);
  });

  it("answers getDependencies and getDependents", async () => {
    const { fixture, service } = await buildFixture();
    const base = symbolId(fixture, "Base", "class");
    const importBase = symbolId(fixture, "Base", "import");

    const dependents = await service.getDependents(symbolNodeId(base.id));
    expect(dependents.ok).toBe(true);
    if (!dependents.ok) {
      return;
    }
    expect(dependents.value.map((node) => node.id)).toContain(symbolNodeId(importBase.id));

    const imports = await service.getDependencies(symbolNodeId(importBase.id));
    expect(imports.ok).toBe(true);
    if (!imports.ok) {
      return;
    }
    expect(imports.value.map((node) => node.id)).toContain(symbolNodeId(base.id));
  });

  it("finds the shortest directed path between two symbols", async () => {
    const { fixture, service } = await buildFixture();
    const scale = symbolId(fixture, "scale", "function");
    const c = symbolId(fixture, "c", "constant");
    const circle = symbolId(fixture, "Circle", "class");
    const area = fixture.indexer
      .listSymbols({ name: "area", kind: "method" })
      .find((s) => s.parentId === circle.id)!;
    const importScale = symbolId(fixture, "scale", "import");
    const importCircle = symbolId(fixture, "Circle", "import");

    const path = await service.shortestPath(symbolNodeId(c.id), symbolNodeId(scale.id));
    expect(path.ok).toBe(true);
    if (!path.ok) {
      return;
    }
    expect(path.value?.map((node) => node.id)).toEqual([
      symbolNodeId(c.id),
      symbolNodeId(importCircle.id),
      symbolNodeId(circle.id),
      symbolNodeId(area.id),
      symbolNodeId(importScale.id),
      symbolNodeId(scale.id),
    ]);
  });

  it("returns null when no path exists between two unrelated modules", async () => {
    const fixture = await indexFixture([
      ["/src/one.ts", `export function one(): number { return 1; }`],
      ["/src/two.ts", `export function two(): number { return 2; }`],
    ]);
    const service = new GraphService().build(fixture.symbols, fixture.references);
    const two = fixture.indexer.findSymbol("two")[0];
    const result = await service.shortestPath(
      fileNodeId("/src/one.ts" as FilePath),
      symbolNodeId(two.id),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toBeNull();
  });

  it("resolves same-file member calls within a class", async () => {
    const fixture = await indexFixture([
      [
        "/src/counter.ts",
        `export class Counter {
  increment(): void { this.reset(); }
  reset(): void {}
}`,
      ],
    ]);
    const service = new GraphService().build(fixture.symbols, fixture.references);
    const counter = fixture.indexer.findSymbol("counter")[0];
    const increment = fixture.indexer.listSymbols({ name: "increment", kind: "method" })[0];
    const reset = fixture.indexer.listSymbols({ name: "reset", kind: "method" })[0];

    const result = await service.exportJson();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const payload = JSON.parse(result.value) as { edges: GraphEdge[] };
    const keys = new Set(payload.edges.map((edge) => `${edge.from}>${edge.to}#${edge.kind}`));
    expect(keys.has(`${symbolNodeId(increment.id)}>${symbolNodeId(reset.id)}#calls`)).toBe(true);
    expect(keys.has(`${symbolNodeId(counter.id)}>${symbolNodeId(increment.id)}#contains`)).toBe(
      true,
    );
  });

  it("resolves default imports to their definition", async () => {
    const fixture = await indexFixture([
      ["/src/thing.ts", `export default function compute(): number { return 1; }`],
      [
        "/src/main.ts",
        `import compute from "./thing";
compute();`,
      ],
    ]);
    const service = new GraphService().build(fixture.symbols, fixture.references);
    const importCompute = fixture.indexer.listSymbols({ name: "compute", kind: "import" })[0];
    const compute = fixture.indexer.findSymbol("compute")[0];

    const dependents = await service.getDependents(symbolNodeId(compute.id));
    expect(dependents.ok).toBe(true);
    if (!dependents.ok) {
      return;
    }
    expect(dependents.value.map((node) => node.id)).toContain(symbolNodeId(importCompute.id));
  });

  it("does not resolve renamed imports to their definition (documented indexer gap)", async () => {
    const fixture = await indexFixture([
      ["/src/a.ts", `export const a = 1;`],
      [
        "/src/b.ts",
        `import { a as b } from "./a";
export const c = b + 1;`,
      ],
    ]);
    const service = new GraphService().build(fixture.symbols, fixture.references);
    const a = fixture.indexer.findSymbol("a")[0];
    const importB = fixture.indexer.listSymbols({ name: "b", kind: "import" })[0];

    const result = await service.exportJson();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const payload = JSON.parse(result.value) as { edges: GraphEdge[] };
    const keys = new Set(payload.edges.map((edge) => `${edge.from}>${edge.to}#${edge.kind}`));
    expect(keys.has(`${symbolNodeId(importB.id)}>${symbolNodeId(a.id)}#imports`)).toBe(false);
  });

  it("addNode and addEdge upsert idempotently", async () => {
    const service = new GraphService();
    const nodeId = "n:manual" as NodeId;
    const otherId = "n:manual-2" as NodeId;
    const first = await service.addNode({ id: nodeId, symbolId: "s:manual" as Symbol["id"] });
    const second = await service.addNode({ id: nodeId, symbolId: "s:manual" as Symbol["id"] });
    const edge = await service.addEdge({
      id: "e:manual" as GraphEdge["id"],
      from: nodeId,
      to: otherId,
      kind: "calls",
    });
    const edgeAgain = await service.addEdge({
      id: "e:manual-2" as GraphEdge["id"],
      from: nodeId,
      to: otherId,
      kind: "calls",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(edge.ok).toBe(true);
    expect(edgeAgain.ok).toBe(true);

    const dependents = await service.getDependents(otherId);
    expect(dependents.ok).toBe(true);
    if (!dependents.ok) {
      return;
    }
    expect(dependents.value).toHaveLength(1);
  });
});
