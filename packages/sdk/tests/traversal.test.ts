import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  assembleContextPackage,
  createContextSDK,
  detectStaleness,
  indexProject,
} from "../src/index";
import type { ContextPackageItem } from "../src/context-integration/models";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixtureRoot = join(repoRoot, "tests", "fixtures", "mcp-audit-repo");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function buildRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "atlas-traversal-"));
  tempRoots.push(root);
  await cp(fixtureRoot, root, { recursive: true });
  const result = await indexProject({ repositoryPath: root, mode: "build" });
  expect(result.ok).toBe(true);
  return root;
}

function traversalItems(pkg: {
  items: readonly ContextPackageItem[];
}): readonly ContextPackageItem[] {
  return pkg.items.filter((item) => item.source === "traversal");
}

async function assemble(root: string, task: string) {
  const sdk = createContextSDK({ repositoryPath: root });
  try {
    const staleness = await detectStaleness(sdk);
    const pkg = assembleContextPackage({
      context: sdk,
      repositoryPath: root,
      task,
      staleness,
      options: {},
    });
    return { sdk, pkg };
  } catch (error) {
    sdk.close();
    throw error;
  }
}

describe("default graph traversal (Phase 2c)", () => {
  it("runs for tasks without dependency-intent wording", async () => {
    const root = await buildRepo();
    const { sdk, pkg } = await assemble(root, "Where should I add a new user endpoint?");
    try {
      const items = traversalItems(pkg);
      // The task does not say "depends on" / "called by" — traversal must still run.
      expect(items.length).toBeGreaterThan(0);
      // And every item explains the graph path that reached it.
      for (const item of items) {
        expect(item.reason).toContain("→");
      }
    } finally {
      sdk.close();
    }
  });

  it("attributes a seed → edge → file path on every traversal item", async () => {
    const root = await buildRepo();
    const { sdk, pkg } = await assemble(
      root,
      "How does the payment service depend on the auth cycle?",
    );
    try {
      const items = traversalItems(pkg);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.traversalPath).toBeDefined();
        const path = item.traversalPath ?? [];
        expect(path.length).toBeGreaterThanOrEqual(3);
        // Odd positions are edge kinds, even positions are node labels.
        for (let i = 1; i < path.length; i += 2) {
          expect(typeof path[i]).toBe("string");
        }
        // The final label is this item's own file (basename suffix).
        expect(path[path.length - 1] ?? "").toMatch(/\.(ts|js)$/);
      }
    } finally {
      sdk.close();
    }
  });

  it("keeps traversal files below their seed's score (decayed lane)", async () => {
    const root = await buildRepo();
    const { sdk, pkg } = await assemble(root, "auth service");
    try {
      const items = traversalItems(pkg);
      // A hop-1 traversal decays to ≤ seed×0.7 ≤ 70; hop-2 ≤ seed×0.49.
      for (const item of items) {
        expect(item.score).toBeLessThanOrEqual(70);
        expect(item.score).toBeGreaterThanOrEqual(1);
      }
    } finally {
      sdk.close();
    }
  });

  it("caps traversal breadth so a dense graph cannot flood the package", async () => {
    const root = await buildRepo();
    const { sdk, pkg } = await assemble(root, "index.ts routes");
    try {
      const items = traversalItems(pkg);
      expect(items.length).toBeLessThanOrEqual(12);
    } finally {
      sdk.close();
    }
  });

  it("is deterministic: the same task yields the same traversal set", async () => {
    const root = await buildRepo();
    const first = await assemble(root, "Where is authentication implemented?");
    const second = await assemble(root, "Where is authentication implemented?");
    try {
      const firstIds = traversalItems(first.pkg).map((item) => item.id);
      const secondIds = traversalItems(second.pkg).map((item) => item.id);
      expect(secondIds).toEqual(firstIds);
    } finally {
      first.sdk.close();
      second.sdk.close();
    }
  });

  it("never duplicates a file already selected as a whole-file item", async () => {
    const root = await buildRepo();
    const { sdk, pkg } = await assemble(root, "auth-service.ts cycle-a.ts");
    try {
      const traversal = traversalItems(pkg);
      // Whole-file items that were NOT themselves traversal additions.
      const selectedWholeFiles = new Set(
        pkg.items
          .filter((item) => item.kind === "file" && item.source !== "traversal")
          .map((item) => item.path)
          .filter((path): path is string => path !== null),
      );
      for (const item of traversal) {
        expect(selectedWholeFiles.has(item.path ?? "")).toBe(false);
      }
      // Traversal still surfaces files beyond the direct keyword hits.
      expect(traversal.length).toBeGreaterThan(0);
    } finally {
      sdk.close();
    }
  });
});
