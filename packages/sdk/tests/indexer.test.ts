import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SourceFile, Summary, SummaryPort } from "@atlas/core";
import { fail, ok } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { afterEach, describe, expect, it } from "vitest";
import { indexProject } from "../src/index";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function summaryFor(file: SourceFile): Summary {
  return {
    kind: "file",
    target: file.path,
    content: { overview: `Overview of ${file.path}`, keyPoints: ["point"] },
    metadata: {
      generatedAt: "2026-08-15T00:00:00.000Z",
      provider: "test",
      model: "test-model",
      prompt: null,
      cacheHit: false,
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  };
}

function fakeSummaryPort(overrides: Partial<SummaryPort> = {}): SummaryPort & {
  readonly calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    summarizeFile: async (file) => {
      calls.push(file.path);
      return ok(summaryFor(file));
    },
    summarizeFolder: async () => fail(new Error("not used")),
    summarizeModule: async () => fail(new Error("not used")),
    summarizeProject: async () => fail(new Error("not used")),
    ...overrides,
  };
}

async function makeProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "atlas-indexer-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  await writeFile(
    join(root, "src", "math.ts"),
    "export function double(value: number) { return value * 2; }\n",
  );
  await writeFile(
    join(root, "src", "index.ts"),
    'import { double } from "./math"; export const answer = double(21);\n',
  );
  return root;
}

describe("indexProject", () => {
  it("creates the manifest and context database for a real project tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-indexer-"));
    roots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src", "math.ts"),
      "export function double(value: number) { return value * 2; }\n",
    );
    await writeFile(
      join(root, "src", "index.ts"),
      'import { double } from "./math"; export const answer = double(21);\n',
    );

    const result = await indexProject({ repositoryPath: root, mode: "build" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files).toBe(2);
    expect(result.value.parsedFiles).toBe(2);
    expect(result.value.symbols).toBeGreaterThan(0);
    expect(result.value.added).toBe(2);

    const store = new ContextStore({ filePath: result.value.dbPath });
    try {
      expect(store.loadContext().files).toHaveLength(2);
      expect(store.loadContext().symbols?.length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it("reports a no-change incremental update", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-indexer-"));
    roots.push(root);
    await writeFile(join(root, "index.ts"), "export const value = 1;\n");
    const first = await indexProject({ repositoryPath: root, mode: "build" });
    expect(first.ok).toBe(true);
    const second = await indexProject({ repositoryPath: root, mode: "update" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.added).toBe(0);
    expect(second.value.changed).toBe(0);
    expect(second.value.deleted).toBe(0);
    expect(second.value.unchanged).toBe(1);
  });

  it("does not generate summaries unless requested", async () => {
    const root = await makeProject();
    const summary = fakeSummaryPort();

    const result = await indexProject({ repositoryPath: root, mode: "build", summary });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summaries).toBe(0);
    expect(result.value.summariesFailed).toBe(0);
    expect(summary.calls).toHaveLength(0);
  });

  it("generates and persists a file summary per parsed file with summaries", async () => {
    const root = await makeProject();
    const summary = fakeSummaryPort();

    const result = await indexProject({
      repositoryPath: root,
      mode: "build",
      summaries: true,
      summary,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summaries).toBe(2);
    expect(result.value.summariesFailed).toBe(0);
    expect(summary.calls).toHaveLength(2);

    const store = new ContextStore({ filePath: result.value.dbPath });
    try {
      const summaries = store.loadContext().summaries ?? [];
      expect(summaries).toHaveLength(2);
      expect(summaries.every((item) => item.kind === "file")).toBe(true);
      expect(summaries.map((item) => item.target).sort()).toEqual(
        expect.arrayContaining([join(root, "src", "index.ts"), join(root, "src", "math.ts")]),
      );
    } finally {
      store.close();
    }
  });

  it("keeps the build when summary generation fails", async () => {
    const root = await makeProject();
    const summary = fakeSummaryPort({
      summarizeFile: async (file) => fail(new Error(`no provider for ${file.path}`)),
    });

    const result = await indexProject({
      repositoryPath: root,
      mode: "build",
      summaries: true,
      summary,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summaries).toBe(0);
    expect(result.value.summariesFailed).toBe(2);
    expect(result.value.files).toBe(2);

    const store = new ContextStore({ filePath: result.value.dbPath });
    try {
      expect(store.loadContext().summaries ?? []).toHaveLength(0);
    } finally {
      store.close();
    }
  });
});
