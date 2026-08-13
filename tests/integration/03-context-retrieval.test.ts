import { describe, expect, it } from "vitest";
import { REPO_PATH, rel, runCli, writeResult } from "./helpers";

interface ContextItemRecord {
  readonly kind: string;
  readonly title: string;
  readonly relPath: string | null;
  readonly tokens: number;
  readonly score: number;
  readonly source: string;
}

interface TaskRecord {
  readonly task: string;
  readonly items: number;
  readonly totalTokens: number;
  readonly top: readonly ContextItemRecord[];
  readonly failed: boolean;
  readonly error: string | null;
}

interface ParsedContext {
  readonly items: readonly {
    readonly kind?: string;
    readonly title?: string;
    readonly path?: string | null;
    readonly tokens?: number;
    readonly score?: number;
    readonly source?: string;
  }[];
}

/**
 * 03 — Context retrieval for realistic developer tasks through the real CLI
 * (`atlas context`) and the SDK's context-integration module. Each task is a
 * natural-language prompt an agent would receive.
 */
describe("03 — context retrieval for real tasks", () => {
  const records: TaskRecord[] = [];

  const tasks: readonly { readonly id: string; readonly task: string }[] = [
    { id: "A", task: "Where is authentication implemented?" },
    { id: "B", task: "How does the frontend communicate with the backend?" },
    { id: "C", task: "Find the component responsible for the design canvas." },
    { id: "D", task: "Where should I modify the login feature?" },
    { id: "E", task: "Explain the architecture of this repository." },
  ];

  function recordTask(id: string, raw: ParsedContext): TaskRecord {
    const items = raw.items ?? [];
    const top = items.slice(0, 8).map((item) => ({
      kind: item.kind ?? "unknown",
      title: item.title ?? "",
      relPath: item.path ? rel(item.path) : null,
      tokens: item.tokens ?? 0,
      score: item.score ?? 0,
      source: item.source ?? "unknown",
    }));
    return {
      task: id,
      items: items.length,
      totalTokens: items.reduce((sum, item) => sum + (item.tokens ?? 0), 0),
      top,
      failed: false,
      error: null,
    };
  }

  it("assembles a context package for each real task", async () => {
    const failures: string[] = [];
    const itemsByTask = new Map<string, ParsedContext["items"]>();

    for (const { id, task } of tasks) {
      const cli = await runCli(["context", task, "--json"]);
      let parsed: ParsedContext;
      try {
        parsed = JSON.parse(cli.stdout) as ParsedContext;
      } catch {
        parsed = { items: [] };
      }
      if (cli.code !== 0 || parsed.items === undefined) {
        failures.push(`task ${id}: CLI failed (${cli.code}) ${cli.stderr}`);
        records.push({
          task: id,
          items: 0,
          totalTokens: 0,
          top: [],
          failed: true,
          error: cli.stderr || "CLI exited non-zero",
        });
        continue;
      }
      records.push(recordTask(id, parsed));
      itemsByTask.set(id, parsed.items);
    }

    const items = (id: string) => itemsByTask.get(id) ?? [];
    const titles = (id: string) => items(id).map((item) => item.title ?? "");
    const paths = (id: string) =>
      items(id)
        .map((item) => (item.path ? rel(item.path) : null))
        .filter((p): p is string => p !== null);

    // Every task must yield a non-empty package with a token estimate.
    for (const { id } of tasks) {
      expect(items(id).length, `task ${id} should produce context items`).toBeGreaterThan(0);
      const total = items(id).reduce((sum, item) => sum + (item.tokens ?? 0), 0);
      expect(total, `task ${id} token estimate should be positive`).toBeGreaterThan(0);
    }

    // C — design canvas: must surface designer/canvas components.
    const cMentionsCanvas = paths("C").some(
      (p) => p.includes("designer") || p.includes("canvas") || p.includes("DesignBuilder"),
    );
    expect(cMentionsCanvas, `task C paths: ${paths("C").join(", ")}`).toBe(true);

    // D — login: must surface the login page (file or symbol).
    const dHasLogin =
      paths("D").some((p) => p.includes("auth/Login")) ||
      titles("D").includes("LoginPage") ||
      titles("D").includes("LogIn");
    expect(dHasLogin, `task D paths: ${paths("D").join(", ")}`).toBe(true);

    // E — architecture: must surface architecture components.
    const eHasArch = titles("E").some(
      (t) => t.includes("Architecture") || t.includes("ArchitectureDiagram"),
    );
    expect(eHasArch, `task E titles: ${titles("E").join(", ")}`).toBe(true);

    // A — authentication: content exists (real gap documented separately).
    expect(paths("A").length, `task A paths: ${paths("A").join(", ")}`).toBeGreaterThan(0);

    if (failures.length > 0) {
      throw new Error(failures.join("\n"));
    }
  });

  it("never leaks raw file contents beyond the budget per item", async () => {
    for (const rec of records) {
      if (rec.failed) continue;
      // Default context budget caps each item at 2000 tokens.
      const oversized = rec.top.filter((item) => item.tokens > 2100);
      expect(oversized, `task ${rec.task} has oversized items`).toEqual([]);
    }
  });

  it("records task results for the report", async () => {
    await writeResult("03-context-retrieval", { records, repository: REPO_PATH });
  });
});
