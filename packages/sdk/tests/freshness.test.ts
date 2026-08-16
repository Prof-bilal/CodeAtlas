import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ContextSDK,
  DEFAULT_CONTEXT_BUDGET,
  assembleContextPackage,
  createContextSDK,
  detectStaleness,
  estimateTokens,
  indexProject,
  renderContextPackage,
} from "../src/index";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "atlas-freshness-"));
  roots.push(root);
  return root;
}

async function withSdkFor(root: string, fn: (sdk: ContextSDK) => Promise<void>): Promise<void> {
  const sdk = createContextSDK({
    dbPath: join(root, ".codeatlas", "context.db"),
    repositoryPath: root,
  });
  try {
    await fn(sdk);
  } finally {
    sdk.close();
  }
}

describe("context freshness (Test A: stale detection + incremental refresh)", () => {
  it("reports fresh, goes stale after an edit, and refreshes back to fresh", async () => {
    const root = await tempRepo();
    await writeFile(join(root, "math.ts"), "export function double(n: number) { return n * 2; }\n");
    await writeFile(
      join(root, "index.ts"),
      'import { double } from "./math";\nexport const answer = double(4);\n',
    );

    const build = await indexProject({ repositoryPath: root, mode: "build" });
    expect(build.ok).toBe(true);

    await withSdkFor(root, async (sdk) => {
      const initial = await sdk.freshness();
      expect(initial.state).toBe("fresh");
      expect(initial.changed).toHaveLength(0);
    });

    // Simulate an edit that the indexer has not seen yet.
    await writeFile(
      join(root, "math.ts"),
      "export function double(n: number) { return n * 2; }\nexport function triple(n: number) { return n * 3; }\n",
    );

    await withSdkFor(root, async (sdk) => {
      const stale = await sdk.freshness();
      expect(stale.state).toBe("stale");
      expect(stale.changed).toContain(join(root, "math.ts"));
    });

    const update = await indexProject({ repositoryPath: root, mode: "update" });
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    expect(update.value.changed).toBe(1);
    expect(update.value.unchanged).toBe(1);

    await withSdkFor(root, async (sdk) => {
      const refreshed = await sdk.freshness();
      expect(refreshed.state).toBe("fresh");
    });
  });
});

describe("context freshness (Test A2: added-file detection)", () => {
  it("reports a newly created file as added without an explicit update", async () => {
    const root = await tempRepo();
    await writeFile(join(root, "math.ts"), "export function double(n: number) { return n * 2; }\n");

    const build = await indexProject({ repositoryPath: root, mode: "build" });
    expect(build.ok).toBe(true);

    await withSdkFor(root, async (sdk) => {
      expect((await sdk.freshness()).state).toBe("fresh");

      // A file added after the index was built must be detected as `added`.
      await writeFile(join(root, "new-module.ts"), "export const added = 1;\n");
      const stale = await sdk.freshness();
      expect(stale.state).toBe("stale");
      expect(stale.added).toContain(join(root, "new-module.ts"));
    });
  });
});

describe("context freshness (Test B: large repo → compact, budgeted context)", () => {
  it("assembles a budgeted package far smaller than the raw tree, not a full dump", async () => {
    const root = await tempRepo();
    const files: Array<{ path: string; content: string }> = [];
    let rawSize = 0;
    for (let i = 0; i < 60; i++) {
      const content = `export function fn${i}(n: number) { return n + ${i}; }\nexport const value${i} = ${i};\n`;
      rawSize += content.length;
      files.push({ path: join(root, "src", `mod${i}.ts`), content });
    }
    for (const file of files) {
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(file.path, file.content);
    }

    const build = await indexProject({ repositoryPath: root, mode: "build" });
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    expect(build.value.files).toBe(60);

    await withSdkFor(root, async (sdk) => {
      const staleness = await detectStaleness(sdk);
      const pkg = assembleContextPackage({
        context: sdk,
        repositoryPath: root,
        task: "Implement a function that returns the total of all value exports.",
        staleness,
        options: {},
      });
      expect(pkg.items.length).toBeGreaterThan(0);
      expect(pkg.items.length).toBeLessThanOrEqual(DEFAULT_CONTEXT_BUDGET.maxItems);

      const rendered = renderContextPackage(pkg);
      const totalTokens = estimateTokens(rendered);
      expect(totalTokens).toBeLessThanOrEqual(DEFAULT_CONTEXT_BUDGET.maxTokensTotal * 2);
      // The package is a curated slice — never the whole tree.
      expect(rendered.length).toBeLessThan(rawSize);
      // It surfaces relevant files over irrelevant ones.
      expect(rendered).toContain("value");
    });
  });
});

describe("context freshness (Test C: line drift + version-aware range reads)", () => {
  it("reads fresh, then flags a stale expectedHash after the file drifts", async () => {
    const root = await tempRepo();
    const filePath = join(root, "drift.ts");
    await writeFile(filePath, "export function target() { return 'original'; }\n");

    const build = await indexProject({ repositoryPath: root, mode: "build" });
    expect(build.ok).toBe(true);

    await withSdkFor(root, async (sdk) => {
      const fresh = sdk.files.readRange(filePath, { startLine: 1, endLine: 1, padding: 0 });
      expect(fresh.versionMatch).toBe(true);
      expect(fresh.stale).toBe(false);
      expect(fresh.content).toContain("target");
      const originalHash = fresh.hash;

      // The file drifts: three lines are inserted above the symbol, so its
      // location and the file hash both change.
      await writeFile(
        filePath,
        "// header\n// notice\n// date\n\nexport function target() { return 'drifted'; }\n",
      );

      const drifted = sdk.files.readRange(filePath, {
        startLine: 5,
        endLine: 5,
        padding: 1,
        expectedHash: originalHash,
      });
      expect(drifted.versionMatch).toBe(false);
      expect(drifted.stale).toBe(true);
      expect(drifted.message).toContain("changed");
      // Padding still surfaces the drifted symbol line.
      expect(drifted.content).toContain("drifted");
    });

    // An incremental refresh re-syncs the index with the drifted file.
    const update = await indexProject({ repositoryPath: root, mode: "update" });
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    expect(update.value.changed).toBe(1);

    await withSdkFor(root, async (sdk) => {
      const current = sdk.files.readRange(filePath, { startLine: 5, endLine: 5, padding: 1 });
      expect(current.versionMatch).toBe(true);
      expect(current.stale).toBe(false);
      expect(current.content).toContain("drifted");
    });
  });
});
