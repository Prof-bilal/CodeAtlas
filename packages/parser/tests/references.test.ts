import type { Reference, Symbol } from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { resolveReferenceTargets } from "../src/references";

function symbol(
  id: string,
  name: string,
  kind: Symbol["kind"],
  parentId: string | null,
  startLine: number,
  endLine: number,
): Symbol {
  return {
    id: id as SymbolId,
    name,
    kind,
    filePath: "/f.ts" as FilePath,
    location: { startLine, startColumn: 1, endLine, endColumn: 1 },
    parentId: (parentId ?? null) as SymbolId | null,
    visibility: "local",
    exported: false,
    modifiers: [],
    moduleSpecifier: null,
    typeText: null,
    documentation: null,
  };
}

function reference(name: string, startLine: number, endLine = startLine): Reference {
  return {
    filePath: "/f.ts" as FilePath,
    name,
    kind: "read",
    location: { startLine, startColumn: 1, endLine, endColumn: 1 },
    targetSymbolId: null,
  };
}

describe("resolveReferenceTargets", () => {
  it("resolves references to module-level symbols by name", () => {
    const symbols = [symbol("s1", "base", "constant", null, 1, 1)];
    const resolved = resolveReferenceTargets([reference("base", 5)], symbols);
    expect(resolved[0]?.targetSymbolId).toBe(symbols[0]?.id);
  });

  it("prefers a matching class member when the reference is inside its span", () => {
    const symbols = [
      symbol("s1", "Service", "class", null, 1, 20),
      symbol("s2", "start", "method", "s1", 2, 4),
      // Same name at module level: the member must win inside the container.
      symbol("s3", "start", "function", null, 30, 32),
    ];
    const inside = resolveReferenceTargets([reference("start", 3)], symbols);
    expect(inside[0]?.targetSymbolId).toBe(symbols[1]?.id);

    const outside = resolveReferenceTargets([reference("start", 31)], symbols);
    expect(outside[0]?.targetSymbolId).toBe(symbols[2]?.id);
  });

  it("falls back to a module-level symbol when the container has no member", () => {
    const symbols = [
      symbol("s1", "Service", "class", null, 1, 20),
      symbol("s2", "helper", "function", null, 30, 32),
    ];
    const resolved = resolveReferenceTargets([reference("helper", 5)], symbols);
    expect(resolved[0]?.targetSymbolId).toBe(symbols[1]?.id);
  });

  it("keeps the first symbol when names collide", () => {
    const symbols = [
      symbol("s1", "dup", "function", null, 1, 1),
      symbol("s2", "dup", "constant", null, 2, 2),
    ];
    const resolved = resolveReferenceTargets([reference("dup", 5)], symbols);
    expect(resolved[0]?.targetSymbolId).toBe(symbols[0]?.id);
  });

  it("leaves unmatched references unresolved", () => {
    const symbols = [symbol("s1", "known", "function", null, 1, 1)];
    const resolved = resolveReferenceTargets([reference("unknown", 5)], symbols);
    expect(resolved[0]?.targetSymbolId).toBeNull();
  });

  it("resolves a large batch of symbols and references without quadratic blowup", () => {
    const count = 500;
    const symbols: Symbol[] = [];
    for (let i = 0; i < count; i += 1) {
      symbols.push(symbol(`s${i}`, `fn${i}`, "function", null, i + 1, i + 1));
    }
    // Every reference points at a different module symbol; a quadratic
    // implementation would do 250,000 `find` scans here.
    const references = symbols.map((s, index) => reference(s.name, count + 1 + index));
    const resolved = resolveReferenceTargets(references, symbols);
    expect(resolved.every((r) => r.targetSymbolId !== null)).toBe(true);
    expect(resolved.map((r) => r.targetSymbolId)).toEqual(symbols.map((s) => s.id));
  });
});
