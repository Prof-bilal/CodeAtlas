import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  MetricsPort,
  SourceFile,
  Summary,
  SummaryPort,
  UsageEventInput,
  UsagePort,
} from "@atlas/core";
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

/** A no-op metrics port that records which record* methods were called. */
function fakeMetricsPort(): MetricsPort & { readonly events: string[] } {
  const events: string[] = [];
  return {
    events,
    snapshot: () => ({}) as never,
    recordScan: (event) =>
      events.push(`scan:${event.files}:${event.symbols}:${event.dependencies}`),
    recordSearch: () => events.push("search"),
    recordContextRequest: () => events.push("context"),
    recordMcpRequest: () => events.push("mcp"),
    recordFileRead: () => events.push("read"),
    recordFileModified: () => events.push("modified"),
    recordTokenEstimate: () => events.push("tokens"),
    flush: () => undefined,
    reset: () => undefined,
    close: () => undefined,
  };
}

/** A usage port that records every submitted event. */
function fakeUsagePort(): UsagePort & { readonly events: readonly UsageEventInput[] } {
  const events: UsageEventInput[] = [];
  return {
    events,
    record: async (event) => {
      events.push(event);
      return ok({ id: `u-${events.length}`, occurredAt: new Date().toISOString() } as never);
    },
    getUsage: () => undefined,
    listUsage: () => [],
    statistics: () => ({}) as never,
    listBudgets: () => [],
    setBudget: () => ok({} as never),
    budgetStatus: () => undefined,
    setLimit: () => ok({} as never),
    checkLimit: () => ok({} as never),
    listLimits: () => [],
    close: () => undefined,
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
    expect(result.value.digestGenerated).toBe(true);
    expect(summary.calls).toHaveLength(0);

    // The deterministic digest is always generated and stored, even when AI
    // summaries are not requested.
    const store = new ContextStore({ filePath: result.value.dbPath });
    try {
      const stored = store.loadContext().summaries ?? [];
      expect(stored).toHaveLength(1);
      expect(stored[0]?.kind).toBe("digest");
    } finally {
      store.close();
    }
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
    expect(result.value.digestGenerated).toBe(true);
    expect(summary.calls).toHaveLength(2);

    const store = new ContextStore({ filePath: result.value.dbPath });
    try {
      const summaries = store.loadContext().summaries ?? [];
      // The two AI file summaries plus the deterministic digest.
      expect(summaries).toHaveLength(3);
      expect(summaries.filter((item) => item.kind === "file").length).toBe(2);
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
      // AI summaries all failed, but the deterministic digest is still stored.
      const stored = store.loadContext().summaries ?? [];
      expect(stored).toHaveLength(1);
      expect(stored[0]?.kind).toBe("digest");
    } finally {
      store.close();
    }
  });

  it("records a scan event with counts when a metrics port is wired", async () => {
    const root = await makeProject();
    const metrics = fakeMetricsPort();

    const result = await indexProject({ repositoryPath: root, mode: "build", metrics });
    expect(result.ok).toBe(true);

    expect(metrics.events).toHaveLength(1);
    expect(metrics.events[0]).toMatch(/^scan:\d+:\d+:\d+$/);
  });

  it("accepts a usage port without breaking indexing", async () => {
    const root = await makeProject();
    const usage = fakeUsagePort();

    const result = await indexProject({
      repositoryPath: root,
      mode: "build",
      summaries: true,
      usage,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No provider is configured, so no provider usage is recorded — the run
    // must still succeed and the usage port must remain usable.
    expect(result.value.summariesFailed).toBe(2);
  });
});
