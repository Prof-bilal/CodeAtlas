import type { Reference, Symbol } from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { SymbolIndexer } from "../src/indexer/symbol-indexer";
import type { ParsedFile } from "../src/parsed-file";
import { parseTs } from "./helpers";

/** Parse each `[path, content]` pair and index all files. */
async function indexFiles(files: ReadonlyArray<readonly [string, string]>): Promise<SymbolIndexer> {
  const indexer = new SymbolIndexer();
  for (const [path, content] of files) {
    indexer.addFile(await parseTs(content, path));
  }
  indexer.resolve();
  return indexer;
}

describe("SymbolIndexer", () => {
  describe("findSymbol", () => {
    it("finds symbols by exact name, case-insensitively by default", async () => {
      const indexer = await indexFiles([
        ["/src/a.ts", `export class Counter {}\nexport function main(): void {}`],
      ]);
      const counters = indexer.findSymbol("counter");
      expect(counters).toHaveLength(1);
      expect(counters[0].kind).toBe("class");
      expect(counters[0].filePath).toBe("/src/a.ts");

      expect(indexer.findSymbol("missing")).toEqual([]);
    });

    it("supports case-sensitive and partial matching", async () => {
      const indexer = await indexFiles([
        ["/src/a.ts", `export class Counter {}\nexport const MAX = 1;`],
      ]);
      expect(indexer.findSymbol("MAX", { matchCase: true })).toHaveLength(1);
      expect(indexer.findSymbol("max", { matchCase: true })).toHaveLength(0);
      expect(indexer.findSymbol("co", { partial: true }).map((s) => s.name)).toEqual(["Counter"]);
    });
  });

  describe("findDefinitions", () => {
    it("returns every definition for a name, including overloads", async () => {
      const indexer = await indexFiles([
        [
          "/src/a.ts",
          `export function parse(a: string): void;
export function parse(a: string, b: number): void;
export function parse(a: string, b?: number): void {}`,
        ],
      ]);
      const byName = indexer.findDefinitions("parse");
      expect(byName).toHaveLength(3);

      const byId = indexer.findDefinitions(byName[0].id);
      expect(byId).toHaveLength(1);
      expect(byId[0].id).toBe(byName[0].id);
    });
  });

  describe("listSymbols", () => {
    it("lists all symbols and filters by kind, file, and export status", async () => {
      const indexer = await indexFiles([
        [
          "/src/a.ts",
          `export class Counter {
  private value = 0;
  increment(): void {}
}
export const MAX = 100;
let scratch = 0;`,
        ],
      ]);
      expect(indexer.listSymbols().map((s) => s.name)).toEqual([
        "Counter",
        "value",
        "increment",
        "MAX",
        "scratch",
      ]);

      expect(indexer.listSymbols({ kind: "constant" }).map((s) => s.name)).toEqual(["MAX"]);
      expect(indexer.listSymbols({ kind: "method" }).map((s) => s.name)).toEqual(["increment"]);
      expect(indexer.listSymbols({ kind: ["class", "constant"] }).map((s) => s.name)).toEqual([
        "Counter",
        "MAX",
      ]);
      expect(indexer.listSymbols({ exported: true }).map((s) => s.name)).toEqual([
        "Counter",
        "MAX",
      ]);
      expect(indexer.listSymbols({ name: "MAX" }).map((s) => s.name)).toEqual(["MAX"]);
      expect(indexer.listSymbols({ filePath: "/src/a.ts" as FilePath })).toHaveLength(5);
      expect(indexer.listSymbols({ filePath: "/nope.ts" as FilePath })).toHaveLength(0);
    });
  });

  describe("getSymbol / children", () => {
    it("exposes a class's children and their metadata", async () => {
      const indexer = await indexFiles([
        [
          "/src/a.ts",
          `/** A counter that counts. */
export class Counter {
  private value = 0;
  increment(): void {}
}`,
        ],
      ]);
      const counter = indexer.getSymbol(indexer.findSymbol("Counter")[0].id)!;
      expect(counter.documentation).toBe("A counter that counts.");
      expect(counter.children.map((id) => indexer.getSymbol(id)?.name)).toEqual([
        "value",
        "increment",
      ]);
      expect(indexer.getSymbol("unknown" as SymbolId)).toBeUndefined();
    });
  });

  describe("findReferences", () => {
    it("returns usages that resolve to a symbol within a file", async () => {
      const indexer = await indexFiles([
        [
          "/src/counter.ts",
          `export class Counter {
  private value = 0;
  increment(): void {
    this.reset();
    this.value += 1;
  }
  reset(): void {}
}`,
        ],
      ]);
      const reset = indexer.findDefinitions("reset")[0];
      const resetRefs = indexer.findReferences(reset.id);
      expect(resetRefs).toHaveLength(1);
      expect(resetRefs[0].name).toBe("reset");
      expect(resetRefs[0].kind).toBe("call");

      const value = indexer.findDefinitions("value")[0];
      const valueRefs = indexer.findReferences(value.id);
      expect(valueRefs).toHaveLength(1);
      expect(valueRefs.every((r) => r.kind === "property")).toBe(true);
    });

    it("resolves usages in importing files to the module's definition", async () => {
      const indexer = await indexFiles([
        [
          "/src/utils.ts",
          `export function format(n: number): string {
  return String(n);
}
export const LIMIT = 10;`,
        ],
        [
          "/src/main.ts",
          `import { format, LIMIT } from "./utils";
export function go(): string {
  return format(LIMIT);
}`,
        ],
      ]);
      const formatDef = indexer
        .findDefinitions("format")
        .find((s) => s.filePath === "/src/utils.ts")!;
      const formatRefs = indexer.findReferences(formatDef.id);
      expect(formatRefs).toHaveLength(1);
      expect(formatRefs[0].filePath).toBe("/src/main.ts");
      expect(formatRefs[0].kind).toBe("call");

      const limitDef = indexer
        .findDefinitions("LIMIT")
        .find((s) => s.filePath === "/src/utils.ts")!;
      expect(indexer.findReferences(limitDef.id)).toHaveLength(1);

      // The import binding is itself a symbol that the same usage targets.
      const importBinding = indexer.findDefinitions("format").find((s) => s.kind === "import")!;
      expect(indexer.findReferences(importBinding.id)).toHaveLength(1);
    });

    it("resolves default imports to the module's default export", async () => {
      const indexer = await indexFiles([
        [
          "/src/thing.ts",
          `export default function compute(): number {
  return 42;
}`,
        ],
        [
          "/src/app.ts",
          `import compute from "./thing";
export function run(): number {
  return compute();
}`,
        ],
      ]);
      const computeDef = indexer
        .findDefinitions("compute")
        .find((s) => s.filePath === "/src/thing.ts")!;
      const refs = indexer.findReferences(computeDef.id);
      expect(refs).toHaveLength(1);
      expect(refs[0].filePath).toBe("/src/app.ts");
    });

    it("resolves renamed imports to the module's export", async () => {
      const indexer = await indexFiles([
        ["/src/a.ts", `export const a = 1;`],
        [
          "/src/b.ts",
          `import { a as b } from "./a";
export const c = b + 1;`,
        ],
      ]);
      const aDef = indexer.findDefinitions("a").find((s) => s.filePath === "/src/a.ts")!;
      const refs = indexer.findReferences(aDef.id);
      expect(refs).toHaveLength(1);
      expect(refs[0].filePath).toBe("/src/b.ts");
      // The alias `b` resolves to the same definition.
      const bAlias = indexer.findDefinitions("b").find((s) => s.kind === "import")!;
      expect(bAlias.name).toBe("b");
      expect(indexer.findReferences(bAlias.id)).toHaveLength(1);
    });

    it("resolves default imports to an anonymous default export", async () => {
      const indexer = await indexFiles([
        [
          "/src/thing.ts",
          `export default function(): number {
  return 42;
}`,
        ],
        [
          "/src/app.ts",
          `import compute from "./thing";
export function run(): number {
  return compute();
}`,
        ],
      ]);
      const defaultDef = indexer.listSymbols({
        filePath: "/src/thing.ts" as FilePath,
        exported: true,
      })[0];
      expect(defaultDef.name).toBe("default");
      const refs = indexer.findReferences(defaultDef.id);
      expect(refs).toHaveLength(1);
      expect(refs[0].filePath).toBe("/src/app.ts");
    });

    it("resolves default imports to an export default expression", async () => {
      const indexer = await indexFiles([
        ["/src/thing.ts", `export default 42;`],
        [
          "/src/app.ts",
          `import answer from "./thing";
export function run(): number {
  return answer;
}`,
        ],
      ]);
      const defaultDef = indexer.listSymbols({
        filePath: "/src/thing.ts" as FilePath,
        exported: true,
      })[0];
      expect(defaultDef.name).toBe("default");
      const refs = indexer.findReferences(defaultDef.id);
      expect(refs).toHaveLength(1);
      expect(refs[0].filePath).toBe("/src/app.ts");
    });

    it("leaves usages of unindexed names unresolved", async () => {
      const indexer = await indexFiles([
        [
          "/src/a.ts",
          `export function f(): number {
  const local = 5;
  return local;
}`,
        ],
      ]);
      // `local` is a function-local declaration and is not part of the index.
      expect(indexer.findSymbol("local")).toEqual([]);
    });
  });

  describe("language independence", () => {
    it("indexes symbols and references from any language (not just TypeScript)", () => {
      const symbol: Symbol = {
        id: "s1" as SymbolId,
        name: "greet",
        kind: "function",
        filePath: "/src/app.py" as FilePath,
        location: { startLine: 1, endLine: 2, startColumn: 1, endColumn: 8 },
        parentId: null,
        visibility: "local",
        exported: false,
        modifiers: [],
        moduleSpecifier: null,
        typeText: null,
        documentation: "Greets someone.",
      };
      const reference: Reference = {
        filePath: "/src/app.py" as FilePath,
        name: "greet",
        kind: "call",
        location: { startLine: 4, endLine: 4, startColumn: 1, endColumn: 7 },
        targetSymbolId: symbol.id,
      };
      const file: ParsedFile = {
        path: "/src/app.py" as FilePath,
        language: "python",
        symbols: [symbol],
        references: [reference],
      };

      const indexer = new SymbolIndexer().index([file]);
      const found = indexer.findSymbol("greet");
      expect(found).toHaveLength(1);
      expect(found[0].documentation).toBe("Greets someone.");
      expect(indexer.findReferences(symbol.id)).toHaveLength(1);
      expect(indexer.filePaths()).toEqual(["/src/app.py"]);
    });
  });
});
