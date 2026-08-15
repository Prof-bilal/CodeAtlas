import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleContextPackage,
  createContextSDK,
  detectStaleness,
  indexProject,
} from "@atlas/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/server";
import { silentLogger } from "./fixture";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixtureRoot = join(repoRoot, "tests", "fixtures", "mcp-audit-repo");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function buildAuditRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "atlas-mcp-correct-"));
  tempRoots.push(root);
  await cp(fixtureRoot, root, { recursive: true });
  const result = await indexProject({ repositoryPath: root, mode: "build" });
  expect(result.ok).toBe(true);
  return root;
}

function rel(root: string, path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

async function packagePaths(
  sdk: Awaited<ReturnType<typeof createContextSDK>>,
  root: string,
  task: string,
): Promise<readonly string[]> {
  const staleness = await detectStaleness(sdk);
  const pkg = assembleContextPackage({
    context: sdk,
    repositoryPath: root,
    task,
    staleness,
    options: {},
  });
  return pkg.items.map((item) => rel(root, item.path ?? root)).filter((path) => path !== "");
}

describe("MCP context correctness", () => {
  it("ranks the definition before equal-score re-export and import references", async () => {
    const root = await buildAuditRepo();
    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const checks = [
        ["authenticateUser", "auth-service.ts"],
        ["validatePayment", "payment-validator.ts"],
        ["createUserRoutes", "routes.ts"],
        ["createResetToken", "password-reset.ts"],
      ] as const;
      for (const [query, expected] of checks) {
        const hit = sdk.search.search(query, { limit: 5 })[0];
        expect(rel(root, hit?.path ?? ""), `top hit for ${query}`).toMatch(
          new RegExp(`${expected}$`),
        );
      }
    } finally {
      sdk.close();
    }
  });

  it("resolves a sentence-final symbol name through the MCP search_symbols tool", async () => {
    const root = await buildAuditRepo();
    const mcp = createMcpServer({ root, logger: silentLogger() });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: "mcp-context-correctness", version: "0.0.0" },
      { capabilities: {} },
    );
    try {
      await mcp.connect(serverTransport);
      await client.connect(clientTransport);
      const result = (await client.callTool({
        name: "search_symbols",
        arguments: { query: "Explain how AuthService depends on UserRepository.", limit: 5 },
      })) as unknown as {
        structuredContent: { hits: Array<{ name: string; path: string; score: number }> };
      };
      const hits = result.structuredContent.hits;
      const userRepository = hits.find((hit) => hit.name === "UserRepository");
      expect(userRepository).toBeDefined();
      // Pre-fix, the trailing period kept "userrepository." and scored fuzzy
      // (~54); the sentence-final form must now resolve exactly.
      expect(userRepository?.score).toBe(100);
      expect(rel(root, userRepository?.path ?? "")).toMatch(/user-repository\.ts$/);
    } finally {
      await mcp.close();
      await client.close();
    }
  });

  it("resolves the AuthService depends-on UserRepository task to both files", async () => {
    const root = await buildAuditRepo();
    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const paths = await packagePaths(
        sdk,
        root,
        "Explain how AuthService depends on UserRepository.",
      );
      expect(paths.some((path) => path.endsWith("auth-service.ts"))).toBe(true);
      expect(paths.some((path) => path.endsWith("user-repository.ts"))).toBe(true);
    } finally {
      sdk.close();
    }
  });

  it("keeps control tasks (authentication, password reset) satisfied by the assembled package", async () => {
    const root = await buildAuditRepo();
    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const auth = await packagePaths(sdk, root, "Where is authentication implemented?");
      expect(auth.some((path) => path.endsWith("auth-service.ts"))).toBe(true);

      const reset = await packagePaths(sdk, root, "Find all code related to password reset.");
      expect(reset.some((path) => path.endsWith("password-reset.ts"))).toBe(true);
      expect(reset.some((path) => path.endsWith("auth-service.ts"))).toBe(true);
    } finally {
      sdk.close();
    }
  });

  it("surfaces routes.ts for the open-ended User API task", async () => {
    // Regression test for the audit's only failing context task: the score-100
    // `add` symbol previously crowded the budget (via explicit resolution +
    // score-100 dependency edges), dropping routes.ts (score 54). Explicit
    // resolution is now restricted to identifier-like words, dependency items
    // are damped and capped, and routes.ts must be present in the package.
    const root = await buildAuditRepo();
    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const paths = await packagePaths(sdk, root, "Where should I add a new user endpoint?");
      expect(paths.some((path) => path.endsWith("routes.ts"))).toBe(true);
    } finally {
      sdk.close();
    }
  });

  it("resolves dependency edges between the auth cycle and the user repository", async () => {
    const root = await buildAuditRepo();
    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const authEdges = sdk.dependencies.query({
        node: join(root, "src", "auth", "auth-service.ts"),
      }).edges;
      expect(authEdges.some((edge) => String(edge.to).includes("user-repository.ts"))).toBe(true);

      const cycleEdges = sdk.dependencies.query({
        node: join(root, "src", "auth", "cycle-a.ts"),
      }).edges;
      expect(cycleEdges.length).toBeGreaterThan(0);
      const graph = sdk.dependencies.getDependencyGraph();
      expect(graph.some((edge) => edge.kind === "imports")).toBe(true);
    } finally {
      sdk.close();
    }
  });

  it("damps and caps dependency items so they never crowd out files", async () => {
    const root = await buildAuditRepo();
    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const staleness = await detectStaleness(sdk);
      const pkg = assembleContextPackage({
        context: sdk,
        repositoryPath: root,
        task: "Where should I add a new user endpoint?",
        staleness,
        options: {},
      });
      const deps = pkg.items.filter((item) => item.kind === "dependency");
      // Capped: never more than MAX_DEPENDENCY_ITEMS (8).
      expect(deps.length).toBeLessThanOrEqual(8);
      // Damped: a dependency edge must not outrank the file items it connects.
      const fileScores = pkg.items
        .filter((item) => item.kind === "file" && item.path !== null)
        .map((item) => item.score);
      for (const dep of deps) {
        expect(dep.score).toBeLessThanOrEqual(Math.max(1, Math.round(100 * 0.4)));
        if (fileScores.length > 0) {
          expect(dep.score).toBeLessThanOrEqual(Math.max(...fileScores));
        }
      }
    } finally {
      sdk.close();
    }
  });

  it("expands the dependency chain for dependency-intent tasks", async () => {
    const root = await buildAuditRepo();
    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const staleness = await detectStaleness(sdk);
      const pkg = assembleContextPackage({
        context: sdk,
        repositoryPath: root,
        task: "How does the payment service depend on the auth cycle?",
        staleness,
        options: {},
      });
      const chainItems = pkg.items.filter((item) => item.source === "dependency-chain");
      // At least one file was pulled in purely through the graph (beyond
      // keyword search), proving the hop expansion runs for dependency intent.
      expect(chainItems.length).toBeGreaterThan(0);
      // And chain files are low-priority evidence, never the top of the package.
      for (const item of chainItems) {
        expect(item.score).toBeLessThanOrEqual(30);
      }
    } finally {
      sdk.close();
    }
  });

  it("does not explicitly resolve prose words to unrelated symbols", async () => {
    const root = await buildAuditRepo();
    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const staleness = await detectStaleness(sdk);
      const pkg = assembleContextPackage({
        context: sdk,
        repositoryPath: root,
        task: "Where should I add a new endpoint for users?",
        staleness,
        options: {},
      });
      // `add` must not be explicitly resolved to GeneratedBatch.add (large-file.ts):
      // prose words are not identifier-like. The task's own words must never be
      // attributed as explicit symbol references.
      const explicit = pkg.items.filter((item) => item.source === "explicit" && item.path !== null);
      for (const item of explicit) {
        expect(item.path).not.toMatch(/large-file\.ts$/);
      }
    } finally {
      sdk.close();
    }
  });
});
