import type { FilePath } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { TypeScriptParser } from "../src/typescript/typescript-parser";
import { parseTs, tsFile } from "./helpers";

describe("TypeScriptParser", () => {
  describe("imports", () => {
    it("extracts default, named, renamed, namespace, type, and side-effect imports", async () => {
      const parsed = await parseTs(`
import defaultThing from "./a";
import { x, y as z } from "./b";
import * as ns from "./c";
import type { Options } from "./d";
import "./side-effect";
`);
      const imports = parsed.symbols.filter((symbol) => symbol.kind === "import");
      expect(imports.map((s) => [s.name, s.modifiers, s.moduleSpecifier])).toEqual([
        ["defaultThing", ["default"], "./a"],
        ["x", ["named"], "./b"],
        ["z", ["renamed"], "./b"],
        ["ns", ["namespace"], "./c"],
        ["Options", ["type", "named"], "./d"],
        ["./side-effect", ["side-effect"], "./side-effect"],
      ]);
      expect(imports.every((s) => s.visibility === "local" && !s.exported)).toBe(true);
    });
  });

  describe("exports", () => {
    it("extracts named, renamed, type, star, and namespace exports", async () => {
      const parsed = await parseTs(`
const a = 1;
const b = 2;
const T = 3;
export { a, b as c };
export type { T };
export * from "./mod";
export * as ns from "./other";
`);
      const exports = parsed.symbols.filter((symbol) => symbol.kind === "export");
      expect(exports.map((s) => [s.name, s.modifiers, s.moduleSpecifier])).toEqual([
        ["a", ["local"], null],
        ["c", ["renamed"], null],
        ["T", ["type", "local"], null],
        ["*", ["re-export", "star"], "./mod"],
        ["ns", ["re-export", "namespace"], "./other"],
      ]);
      expect(exports.every((s) => s.visibility === "exported" && s.exported)).toBe(true);
    });

    it("extracts `export default` and `export =` assignments", async () => {
      const parsed = await parseTs(`
const value = 42;
export default value;
`);
      const defaultExport = parsed.symbols.find((s) => s.kind === "export" && s.name === "default");
      expect(defaultExport).toBeDefined();
      expect(defaultExport?.modifiers).toEqual(["assignment", "default"]);
      expect(defaultExport?.exported).toBe(true);
    });
  });

  describe("classes", () => {
    it("extracts a class with its methods, constructor, and properties", async () => {
      const parsed = await parseTs(`export abstract class Service {
  private name: string;
  static counter = 0;
  constructor(public readonly id: Id) {
    this.name = "svc";
  }
  public async start(): Promise<void> {}
  protected stop(): void {}
  private static reset(): void {}
}`);
      const klass = parsed.symbols.find((s) => s.kind === "class")!;
      expect(klass.name).toBe("Service");
      expect(klass.visibility).toBe("exported");
      expect(klass.exported).toBe(true);
      expect(klass.modifiers).toEqual(["export", "abstract"]);
      expect(klass.parentId).toBeNull();
      expect(klass.location).toEqual({
        startLine: 1,
        startColumn: 1,
        endLine: 10,
        endColumn: 2,
      });

      const start = parsed.symbols.find((s) => s.kind === "method" && s.name === "start")!;
      expect(start.parentId).toBe(klass.id);
      expect(start.visibility).toBe("public");
      expect(start.modifiers).toEqual(["public", "async"]);
      expect(start.location.startLine).toBe(7);
      expect(start.location.startColumn).toBe(3);

      const stop = parsed.symbols.find((s) => s.kind === "method" && s.name === "stop")!;
      expect(stop.visibility).toBe("protected");

      const reset = parsed.symbols.find((s) => s.kind === "method" && s.name === "reset")!;
      expect(reset.visibility).toBe("private");
      expect(reset.modifiers).toEqual(["private", "static"]);

      const constructor = parsed.symbols.find((s) => s.kind === "constructor")!;
      expect(constructor.name).toBe("constructor");
      expect(constructor.parentId).toBe(klass.id);
      expect(constructor.location.startLine).toBe(4);

      const name = parsed.symbols.find((s) => s.kind === "property" && s.name === "name")!;
      expect(name.parentId).toBe(klass.id);
      expect(name.visibility).toBe("private");
      expect(name.typeText).toBe("string");

      const counter = parsed.symbols.find((s) => s.kind === "property" && s.name === "counter")!;
      expect(counter.visibility).toBe("public");
      expect(counter.modifiers).toEqual(["static"]);
      expect(counter.typeText).toBe("number");

      // Parameter properties surface as class members.
      const id = parsed.symbols.find((s) => s.kind === "property" && s.name === "id")!;
      expect(id.parentId).toBe(klass.id);
      expect(id.modifiers).toEqual(["public", "readonly", "parameter-property"]);
      expect(id.typeText).toBe("Id");
    });
  });

  describe("interfaces", () => {
    it("extracts an interface with its properties and methods", async () => {
      const parsed = await parseTs(`export interface Config {
  readonly debug: boolean;
  url: string;
  load(id: string): void;
}`);
      const iface = parsed.symbols.find((s) => s.kind === "interface")!;
      expect(iface.name).toBe("Config");
      expect(iface.exported).toBe(true);

      const debug = parsed.symbols.find((s) => s.kind === "property" && s.name === "debug")!;
      expect(debug.parentId).toBe(iface.id);
      expect(debug.visibility).toBe("public");
      expect(debug.modifiers).toEqual(["readonly"]);
      expect(debug.typeText).toBe("boolean");

      const url = parsed.symbols.find((s) => s.kind === "property" && s.name === "url")!;
      expect(url.typeText).toBe("string");

      const load = parsed.symbols.find((s) => s.kind === "method" && s.name === "load")!;
      expect(load.parentId).toBe(iface.id);
      expect(load.typeText).toBe("void");
    });
  });

  describe("functions", () => {
    it("extracts exported, local, and default-exported functions", async () => {
      const parsed = await parseTs(`export function top(a: number): number {
  return a;
}
function local() {}
export default function helper() {}`);
      const top = parsed.symbols.find((s) => s.kind === "function" && s.name === "top")!;
      expect(top.exported).toBe(true);
      expect(top.visibility).toBe("exported");
      expect(top.modifiers).toEqual(["export"]);

      const local = parsed.symbols.find((s) => s.kind === "function" && s.name === "local")!;
      expect(local.exported).toBe(false);
      expect(local.visibility).toBe("local");
      expect(local.modifiers).toEqual([]);

      const helper = parsed.symbols.find((s) => s.kind === "function" && s.name === "helper")!;
      expect(helper.exported).toBe(true);
      expect(helper.modifiers).toEqual(["export", "default"]);
    });

    it("emits one symbol per overload", async () => {
      const parsed = await parseTs(`function parse(input: string): string;
function parse(input: string, strict: boolean): string;
function parse(input: string, strict?: boolean): string {
  return input;
}`);
      const overloads = parsed.symbols.filter((s) => s.kind === "function" && s.name === "parse");
      expect(overloads).toHaveLength(3);
      expect(new Set(overloads.map((o) => o.location.startLine)).size).toBe(3);
    });
  });

  describe("variables", () => {
    it("classifies const declarations as constants and let/var as variables", async () => {
      const parsed = await parseTs(`export const VERSION = "1.0.0";
let count = 0;
var legacy = 1;
const add = (a: number): number => a + 1;`);
      const version = parsed.symbols.find((s) => s.kind === "constant" && s.name === "VERSION")!;
      expect(version.exported).toBe(true);
      expect(version.visibility).toBe("exported");
      expect(version.modifiers).toEqual(["export", "const"]);
      expect(version.typeText).toBe('"1.0.0"');

      const add = parsed.symbols.find((s) => s.kind === "constant" && s.name === "add")!;
      expect(add.modifiers).toEqual(["const"]);

      const count = parsed.symbols.find((s) => s.kind === "variable" && s.name === "count")!;
      expect(count.visibility).toBe("local");
      expect(count.modifiers).toEqual(["let"]);
      expect(count.typeText).toBe("number");

      const legacy = parsed.symbols.find((s) => s.kind === "variable" && s.name === "legacy")!;
      expect(legacy.modifiers).toEqual(["var"]);
    });
  });

  describe("documentation", () => {
    it("captures JSDoc comments on symbols and null when absent", async () => {
      const parsed = await parseTs(`/**
 * A service that does things.
 */
export class Service {
  /** Starts the service. */
  start(): void {}
}
const plain = 1;`);
      const klass = parsed.symbols.find((s) => s.kind === "class")!;
      expect(klass.documentation).toBe("A service that does things.");

      const method = parsed.symbols.find((s) => s.kind === "method")!;
      expect(method.documentation).toBe("Starts the service.");

      const plain = parsed.symbols.find((s) => s.name === "plain")!;
      expect(plain.documentation).toBeNull();
    });
  });

  describe("references", () => {
    it("extracts and resolves identifier usages within a file", async () => {
      const parsed = await parseTs(`export const BASE = 10;
export function double(x: number): number {
  return x * 2;
}
export class Service {
  start(): void {
    const total = BASE + double(2);
    this.reset();
  }
  reset(): void {}
}
const svc = new Service();
svc.start();`);

      expect(parsed.references.length).toBeGreaterThan(0);

      const doubleDef = parsed.symbols.find((s) => s.name === "double")!;
      const doubleCall = parsed.references.find((r) => r.name === "double")!;
      expect(doubleCall.kind).toBe("call");
      expect(doubleCall.targetSymbolId).toBe(doubleDef.id);

      const baseDef = parsed.symbols.find((s) => s.name === "BASE")!;
      const baseRef = parsed.references.find((r) => r.name === "BASE")!;
      expect(baseRef.kind).toBe("read");
      expect(baseRef.targetSymbolId).toBe(baseDef.id);

      // `this.reset()` resolves to the class member via member scope.
      const service = parsed.symbols.find((s) => s.name === "Service")!;
      const resetDef = parsed.symbols.find((s) => s.name === "reset" && s.parentId === service.id)!;
      const resetRef = parsed.references.find((r) => r.name === "reset")!;
      expect(resetRef.kind).toBe("call");
      expect(resetRef.targetSymbolId).toBe(resetDef.id);

      const serviceRef = parsed.references.find((r) => r.name === "Service")!;
      expect(serviceRef.kind).toBe("construct");

      // Unresolved usages keep targetSymbolId null.
      const svcRef = parsed.references.find((r) => r.name === "svc")!;
      expect(svcRef.targetSymbolId).toBe(parsed.symbols.find((s) => s.name === "svc")!.id);
    });

    it("classifies heritage clause identifiers as extends and implements", async () => {
      const parsed = await parseTs(`export class Base {}
export interface Shape {
  area(): number;
}
export class Circle extends Base implements Shape {
  area(): number {
    return 0;
  }
}`);
      const base = parsed.symbols.find((s) => s.name === "Base")!;
      const baseRef = parsed.references.find((r) => r.name === "Base")!;
      expect(baseRef.kind).toBe("extends");
      expect(baseRef.targetSymbolId).toBe(base.id);

      const shape = parsed.symbols.find((s) => s.name === "Shape")!;
      const shapeRef = parsed.references.find((r) => r.name === "Shape")!;
      expect(shapeRef.kind).toBe("implements");
      expect(shapeRef.targetSymbolId).toBe(shape.id);
    });
  });

  describe("enums", () => {
    it("extracts enums and their members with computed values", async () => {
      const parsed = await parseTs(`export enum Mode {
  Fast,
  Slow = 2,
}`);
      const mode = parsed.symbols.find((s) => s.kind === "enum")!;
      expect(mode.name).toBe("Mode");
      expect(mode.exported).toBe(true);

      const fast = parsed.symbols.find((s) => s.kind === "enum-member" && s.name === "Fast")!;
      expect(fast.parentId).toBe(mode.id);
      expect(fast.typeText).toBe("0");

      const slow = parsed.symbols.find((s) => s.kind === "enum-member" && s.name === "Slow")!;
      expect(slow.parentId).toBe(mode.id);
      expect(slow.typeText).toBe("2");
    });
  });

  describe("type aliases", () => {
    it("extracts type aliases with their type text", async () => {
      const parsed = await parseTs(`export type Id = string | number;`);
      const id = parsed.symbols.find((s) => s.kind === "type-alias")!;
      expect(id.name).toBe("Id");
      expect(id.exported).toBe(true);
      expect(id.modifiers).toEqual(["export"]);
      expect(id.typeText).toBe("string | number");
    });
  });

  describe("locations", () => {
    it("computes 1-based, trivia-free spans", async () => {
      const parsed = await parseTs(`export class A {
  method() {}
}`);
      const klass = parsed.symbols.find((s) => s.kind === "class")!;
      expect(klass.location).toEqual({
        startLine: 1,
        startColumn: 1,
        endLine: 3,
        endColumn: 2,
      });
      const method = parsed.symbols.find((s) => s.kind === "method")!;
      expect(method.location).toEqual({
        startLine: 2,
        startColumn: 3,
        endLine: 2,
        endColumn: 14,
      });
    });

    it("skips leading JSDoc comments when reporting the span", async () => {
      const parsed = await parseTs(`/**
 * Documented.
 */
export function documented(): void {}`);
      const fn = parsed.symbols.find((s) => s.kind === "function")!;
      expect(fn.location.startLine).toBe(4);
      expect(fn.location.startColumn).toBe(1);
    });
  });

  describe("robustness", () => {
    it("returns no symbols for an empty file", async () => {
      const parsed = await parseTs("");
      expect(parsed.symbols).toEqual([]);
      expect(parsed.path).toBe("/fixture/sample.ts");
      expect(parsed.language).toBe("typescript");
    });

    it("does not throw on syntactically invalid content", async () => {
      const parser = new TypeScriptParser();
      const result = await parser.parse(tsFile("class {"));
      expect(result.ok).toBe(true);
    });

    it("fails when given a non-TypeScript file", async () => {
      const parser = new TypeScriptParser();
      const result = await parser.parse({
        path: "/x.py" as FilePath,
        language: "python",
        content: "",
      });
      expect(result.ok).toBe(false);
    });
  });
});
