import type { FilePath } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { GraphService } from "../src/graph.service";
import { fileNodeId, symbolNodeId } from "../src/ids";
import { indexFixture } from "./helpers";

describe("GraphService.detectCircularDependencies", () => {
  it("reports a cycle for a pair of mutually importing files", async () => {
    const fixture = await indexFixture([
      [
        "/src/a.ts",
        `import { b } from "./b";
export const a = b + 1;`,
      ],
      [
        "/src/b.ts",
        `import { a } from "./a";
export const b = a + 1;`,
      ],
    ]);
    const service = new GraphService().build(fixture.symbols, fixture.references);

    const result = await service.detectCircularDependencies();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const fileA = fileNodeId("/src/a.ts" as FilePath);
    const fileB = fileNodeId("/src/b.ts" as FilePath);
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value.some((cycle) => cycle.includes(fileA) && cycle.includes(fileB))).toBe(true);
  });

  it("reports a self-loop for a recursive function", async () => {
    const fixture = await indexFixture([
      [
        "/src/f.ts",
        `export function f(n: number): number {
  return n <= 0 ? 1 : f(n - 1);
}`,
      ],
    ]);
    const service = new GraphService().build(fixture.symbols, fixture.references);

    const f = fixture.indexer.findSymbol("f")[0];
    const node = symbolNodeId(f.id);
    const result = await service.detectCircularDependencies();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.value.some((cycle) => cycle.length === 2 && cycle[0] === node && cycle[1] === node),
    ).toBe(true);
  });

  it("returns no cycles for an acyclic graph", async () => {
    const fixture = await indexFixture([
      ["/src/a.ts", `export function a(): number { return 1; }`],
      [
        "/src/b.ts",
        `import { a } from "./a";
export function b(): number { return a(); }`,
      ],
    ]);
    const service = new GraphService().build(fixture.symbols, fixture.references);

    const result = await service.detectCircularDependencies();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toEqual([]);
  });
});
