import type { Symbol as CodeSymbol, PersistedDependency } from "@atlas/core";
import type { NodeId } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { expandDependencyClosure } from "../src/context/closure";

/** Fixture snapshot: auth.ts ↔ session.ts, auth.test.ts, config file, types.ts. */
function fixtureSnapshot() {
  const symbols = [
    symbol("s-auth", "authenticate", "src/auth.ts", "function"),
    symbol("s-session", "createSession", "src/session.ts", "function"),
    symbol("s-user-type", "User", "src/types.ts", "interface"),
  ];
  const dependencies: PersistedDependency[] = [
    // session.ts imports auth.ts (so auth.ts's caller is session.ts)
    dep("n:file:src/session.ts", "n:file:src/auth.ts", "imports"),
    // auth.ts imports types.ts (so auth.ts's callee is types.ts)
    dep("n:file:src/auth.ts", "n:file:src/types.ts", "imports"),
    // auth.test.ts references auth.ts
    dep("n:file:src/auth.test.ts", "n:file:src/auth.ts", "references"),
  ];
  return { files: [], symbols, dependencies, version: 1, savedAt: "" };
}

function symbol(id: string, name: string, filePath: string, kind: CodeSymbol["kind"]): CodeSymbol {
  return {
    id,
    name,
    kind,
    filePath,
    location: { startLine: 1, endLine: 10, startColumn: 1, endColumn: 1 },
    parentId: null,
    visibility: "exported",
    exported: true,
    modifiers: [],
  } as unknown as CodeSymbol;
}

function dep(from: string, to: string, kind: string): PersistedDependency {
  return { from: from as NodeId, to: to as NodeId, kind };
}

describe("expandDependencyClosure", () => {
  it("expands callers, callees, tests, and interfaces with reasons", () => {
    const expansions = expandDependencyClosure(fixtureSnapshot(), ["src/auth.ts"]);
    const byPath = new Map<string, (typeof expansions)[number]>(
      expansions.map((e) => [e.path as string, e]),
    );

    expect(byPath.get("src/session.ts")?.kind).toBe("caller");
    expect(byPath.get("src/session.ts")?.reason).toContain("caller of src/auth.ts");
    expect(byPath.get("src/types.ts")?.kind).toBe("interface");
    expect(byPath.get("src/auth.test.ts")?.kind).toBe("test");
    expect(byPath.get("src/auth.test.ts")?.annotations["testsFor"]).toBe("src/auth.ts");
  });

  it("assigns tiers: important for code, supporting for config", () => {
    const snapshot = fixtureSnapshot();
    snapshot.dependencies.push(dep("n:file:package.json", "n:file:src/auth.ts", "references"));
    const expansions = expandDependencyClosure(snapshot, ["src/auth.ts"]);
    const byPath = new Map<string, (typeof expansions)[number]>(
      expansions.map((e) => [e.path as string, e]),
    );
    expect(byPath.get("src/session.ts")?.tier).toBe("important");
    expect(byPath.get("package.json")?.kind).toBe("config");
    expect(byPath.get("package.json")?.tier).toBe("supporting");
  });

  it("excludes seeds themselves and never duplicates a path", () => {
    const expansions = expandDependencyClosure(fixtureSnapshot(), [
      "src/auth.ts",
      "src/session.ts",
    ]);
    const paths = expansions.map((e) => e.path);
    expect(paths).not.toContain("src/auth.ts");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("supports 2-hop expansion behind the budget option", () => {
    // chain: a.ts -> b.ts -> c.ts
    const snapshot = {
      files: [],
      symbols: [],
      dependencies: [
        dep("n:file:src/a.ts", "n:file:src/b.ts", "imports"),
        dep("n:file:src/b.ts", "n:file:src/c.ts", "imports"),
      ],
    };
    expect(expandDependencyClosure(snapshot, ["src/a.ts"]).map((e) => e.path)).toEqual([
      "src/b.ts",
    ]);
    const twoHops = expandDependencyClosure(snapshot, ["src/a.ts"], { hops: 2 });
    expect(twoHops.map((e) => e.path)).toContain("src/c.ts");
    expect(twoHops.find((e) => e.path === "src/c.ts")?.["hop"]).toBe(2);
  });

  it("caps fan-out per seed", () => {
    const deps = Array.from({ length: 20 }, (_, i) =>
      dep("n:file:src/hub.ts", `n:file:src/gen${i}.ts`, "imports"),
    );
    const expansions = expandDependencyClosure(
      { files: [], symbols: [], dependencies: deps },
      ["src/hub.ts"],
      { maxPerSeed: 5 },
    );
    expect(expansions.length).toBeLessThanOrEqual(5);
  });

  it("respects includeTests / includeConfig toggles", () => {
    const snapshot = fixtureSnapshot();
    snapshot.dependencies.push(dep("n:file:vitest.config.ts", "n:file:src/auth.ts", "references"));
    const all = expandDependencyClosure(snapshot, ["src/auth.ts"]);
    expect(all.some((e) => e.kind === "test")).toBe(true);
    expect(all.some((e) => e.kind === "config")).toBe(true);

    const noTests = expandDependencyClosure(snapshot, ["src/auth.ts"], {
      includeTests: false,
      includeConfig: false,
    });
    expect(noTests.some((e) => e.kind === "test")).toBe(false);
    expect(noTests.some((e) => e.kind === "config")).toBe(false);
  });

  it("returns empty for empty seeds and deterministic output order", () => {
    expect(expandDependencyClosure(fixtureSnapshot(), [])).toEqual([]);
    const snapshot = fixtureSnapshot();
    const a = expandDependencyClosure(snapshot, ["src/auth.ts"]);
    const b = expandDependencyClosure(snapshot, ["src/auth.ts"]);
    expect(a).toEqual(b);
  });
});
