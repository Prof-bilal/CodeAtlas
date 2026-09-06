import type { GraphEdge } from "@atlas/core";
import type { FilePath } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { GraphService, deriveTestEdges } from "../src/graph.service";
import { fileNodeId } from "../src/ids";
import { indexFixture } from "./helpers";

/** Build a graph whose files include same-dir and __tests__ mirror tests. */
async function buildTestedFixture() {
  const fixture = await indexFixture([
    ["/src/auth/service.ts", `export class AuthService { login() { return true; } }`],
    [
      "/src/auth/service.test.ts",
      `import { AuthService } from "./service";
describe("AuthService", () => { it("logs in", () => new AuthService().login()); });`,
    ],
    [
      "/src/auth/__tests__/service.spec.ts",
      `import { AuthService } from "../service";
describe("AuthService", () => { it("logs in", () => new AuthService().login()); });`,
    ],
    ["/src/users/repository.ts", `export class UserRepository { find() { return []; } }`],
    [
      "/src/users/repository.test.ts",
      `import { UserRepository } from "./repository";
it("finds", () => new UserRepository().find());`,
    ],
  ]);
  const service = new GraphService().build(fixture.symbols, fixture.references);
  return { fixture, service };
}

async function testedByEdges(service: GraphService): Promise<readonly GraphEdge[]> {
  const result = await service.exportJson();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return [];
  }
  const payload = JSON.parse(result.value) as { edges: GraphEdge[] };
  return payload.edges.filter((edge) => edge.kind === "tested-by");
}

describe("tested-by derivation (F4)", () => {
  it("derives same-dir .test/.spec pairs", () => {
    const edges = deriveTestEdges([
      "/src/auth/service.ts",
      "/src/auth/service.test.ts",
      "/src/auth/service.spec.ts",
      "/src/auth/other.ts",
    ]);
    expect(edges).toContainEqual({
      impl: "/src/auth/service.ts",
      test: "/src/auth/service.test.ts",
    });
    expect(edges).toContainEqual({
      impl: "/src/auth/service.ts",
      test: "/src/auth/service.spec.ts",
    });
    expect(edges.some((edge) => edge.impl === "/src/auth/other.ts")).toBe(false);
  });

  it("derives __tests__ mirror pairs", () => {
    const edges = deriveTestEdges([
      "/src/auth/service.ts",
      "/src/auth/__tests__/service.test.ts",
      "/src/users/repository.ts",
      "/src/users/__tests__/repository.ts",
    ]);
    expect(edges).toContainEqual({
      impl: "/src/auth/service.ts",
      test: "/src/auth/__tests__/service.test.ts",
    });
    expect(edges).toContainEqual({
      impl: "/src/users/repository.ts",
      test: "/src/users/__tests__/repository.ts",
    });
  });

  it("does not invent impl files that do not exist", () => {
    const edges = deriveTestEdges(["/src/auth/service.test.ts", "/src/auth/other.test.ts"]);
    expect(edges).toHaveLength(0);
  });

  it("emits tested-by edges in the built graph", async () => {
    const { service } = await buildTestedFixture();
    const edges = await testedByEdges(service);
    const keys = new Set(edges.map((edge) => `${edge.from}>${edge.to}`));
    expect(
      keys.has(
        `${fileNodeId("/src/auth/service.ts" as FilePath)}>${fileNodeId("/src/auth/service.test.ts" as FilePath)}`,
      ),
    ).toBe(true);
    expect(
      keys.has(
        `${fileNodeId("/src/auth/service.ts" as FilePath)}>${fileNodeId("/src/auth/__tests__/service.spec.ts" as FilePath)}`,
      ),
    ).toBe(true);
    expect(
      keys.has(
        `${fileNodeId("/src/users/repository.ts" as FilePath)}>${fileNodeId("/src/users/repository.test.ts" as FilePath)}`,
      ),
    ).toBe(true);
  });

  it("does not link test files to other test files", async () => {
    const { service } = await buildTestedFixture();
    const edges = await testedByEdges(service);
    for (const edge of edges) {
      expect(edge.from.endsWith(".test.ts") || edge.from.endsWith(".spec.ts")).toBe(false);
      expect(edge.to.endsWith(".test.ts") || edge.to.endsWith(".spec.ts")).toBe(true);
    }
  });
});

describe("unresolved import counting (Phase 5)", () => {
  it("counts relative imports that name no indexed file", async () => {
    const fixture = await indexFixture([
      ["/src/a.ts", 'import { missing } from "./does-not-exist";\nexport const a = 1;'],
      ["/src/b.ts", 'import { x } from "./a";\nexport const b = x;'],
    ]);
    const service = new GraphService().build(fixture.symbols, fixture.references);
    expect(service.unresolvedImportCount()).toBe(1);
  });

  it("does not count node builtins or bare package specifiers", async () => {
    const fixture = await indexFixture([
      [
        "/src/a.ts",
        'import { readFile } from "node:fs";\nimport { useState } from "react";\nexport const a = 1;',
      ],
    ]);
    const service = new GraphService().build(fixture.symbols, fixture.references);
    expect(service.unresolvedImportCount()).toBe(0);
  });

  it("counts local alias (tsconfig-paths style) specifiers as unresolved", async () => {
    const fixture = await indexFixture([
      ["/src/a.ts", 'import { helper } from "@/lib/helper";\nexport const a = helper;'],
    ]);
    const service = new GraphService().build(fixture.symbols, fixture.references);
    expect(service.unresolvedImportCount()).toBe(1);
  });
});
