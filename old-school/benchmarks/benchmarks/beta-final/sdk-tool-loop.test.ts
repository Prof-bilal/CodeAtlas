import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { ToolUsingChatAgent, createContextSDK, indexProject } from "@atlas/sdk";
import { createContextToolSourceFromSDK } from "@atlas/mcp";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REPOS = [
  {
    id: "small-app",
    path: "/home/bilal/CodeAtlas/benchmark-repos/01-small-app",
    tasksFile: "small-app.json",
  },
  {
    id: "medium-api",
    path: "/home/bilal/CodeAtlas/benchmark-repos/02-medium-api",
    tasksFile: "medium-api.json",
  },
  {
    id: "monorepo",
    path: "/home/bilal/CodeAtlas/benchmark-repos/03-monorepo",
    tasksFile: "monorepo.json",
  },
];

const onlyRepo = process.env.BENCH_REPO ?? null;
const onlyTask = process.env.BENCH_TASK ?? null;

const coreToolName = (name: string): string =>
  String(name).replace(/^codeatlas_/, "");

/** Deterministic replay provider simulating the audit's pathological agent. */
class ScriptedToolAgentProvider {
  task: { expected_files?: string[]; expected_concepts?: string[] };
  step = 0;
  constructor(task: {
    expected_files?: string[];
    expected_concepts?: string[];
  }) {
    this.task = task;
  }
  handles() {
    return true;
  }
  async complete() {
    const step = this.step++;
    const t = this.task;
    const toolCall = (
      id: string,
      name: string,
      args: Record<string, unknown>,
    ) => ({
      id,
      type: "function" as const,
      function: { name, arguments: JSON.stringify(args) },
    });
    const file =
      t.expected_files && t.expected_files[0]
        ? t.expected_files[0]
        : "/src/index.ts";
    if (step === 0)
      return this.resp([toolCall("c0", "search_symbols", { query: "auth" })]);
    if (step === 1)
      return this.resp([
        toolCall("c1", "search_symbols", { query: "authenticate" }),
      ]);
    if (step === 2)
      return this.resp([toolCall("c2", "search_files", { query: "tests" })]);
    if (step === 3)
      return this.resp([toolCall("c3", "search_files", { query: "config" })]);
    if (step === 4)
      return this.resp([toolCall("c4", "search_files", { query: "docs" })]);
    if (step === 5)
      return this.resp([
        toolCall("c5", "read_file_range", {
          path: file,
          startLine: 1,
          endLine: 15,
          padding: 0,
        }),
      ]);
    const concepts = t.expected_concepts ?? [];
    const files = t.expected_files ?? [];
    const citations = files.map((f) => `\`${basename(f)}\``).join(", ");
    return this.resp(
      undefined,
      `Based on the CodeAtlas context I found: ${concepts.join(", ")}. Key files: ${citations}.`,
    );
  }
  resp(toolCalls: any[] | undefined, content = "") {
    return {
      ok: true,
      value: {
        provider: "sdk-tool-loop",
        content,
        model: "scripted-replay",
        usage: undefined,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      },
    };
  }
}

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[_/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function evaluateTask(
  task: { expected_files?: string[]; expected_concepts?: string[] },
  finalText: string,
  toolOutputs: string[],
) {
  const haystack = norm(
    finalText + "\n" + toolOutputs.map((o) => norm(o)).join("\n"),
  );
  const filesFound = (task.expected_files ?? []).filter((f) =>
    haystack.includes(norm(basename(f))),
  );
  const conceptsFound = (task.expected_concepts ?? []).filter((c) =>
    haystack.includes(norm(c)),
  );
  const fileRatio = task.expected_files?.length
    ? filesFound.length / task.expected_files.length
    : 0;
  const conceptRatio = task.expected_concepts?.length
    ? conceptsFound.length / task.expected_concepts.length
    : 0;
  const score =
    fileRatio >= 0.5 && conceptRatio >= 0.5
      ? 2
      : fileRatio >= 0.2 || conceptRatio >= 0.2
        ? 1
        : 0;
  return { score, filesFound, conceptsFound };
}

const EST = (text: string) => Math.ceil(String(text).length / 4);

async function ensureIndexed(repoPath: string) {
  if (existsSync(join(repoPath, ".codeatlas", "context.db"))) return true;
  const result = await indexProject({
    repositoryPath: repoPath,
    mode: "build",
  });
  return result.ok;
}

async function runTask(repo: (typeof REPOS)[number], task: any) {
  const sdk = createContextSDK({ repositoryPath: repo.path });
  const executedByTool: Record<string, number> = {};
  const toolOutputs: string[] = [];
  try {
    const base = createContextToolSourceFromSDK(sdk);
    const toolSource = {
      listTools: () => base.listTools(),
      getDenyFilter: base.getDenyFilter
        ? () => base.getDenyFilter()
        : undefined,
      async execute(name: string, args: Record<string, unknown>) {
        const core = coreToolName(name);
        executedByTool[core] = (executedByTool[core] ?? 0) + 1;
        const result = await base.execute(name, args);
        if (result.ok) toolOutputs.push(JSON.stringify(result.value));
        return result;
      },
    };
    const agent = new ToolUsingChatAgent(
      new ScriptedToolAgentProvider(task) as never,
      toolSource,
      ["sdk-tool-loop"],
    );
    const started = performance.now();
    const result = await agent.run({
      provider: "sdk-tool-loop",
      prompt: task.prompt,
      repositoryPath: repo.path,
    });
    const durationMs = Math.round(performance.now() - started);
    let finalContent = "";
    let messages: any[] = [];
    let error: string | null = null;
    if (result.ok) {
      finalContent = result.value.content;
      messages = result.value.messages ?? [];
    } else {
      error = result.error.message;
    }
    const evalResult = evaluateTask(task, finalContent, toolOutputs);
    return {
      taskId: task.id,
      repoId: repo.id,
      category: task.category,
      ok: result.ok,
      error,
      score: evalResult.score,
      filesFound: evalResult.filesFound,
      durationMs,
      tokenGuess: messages.reduce((sum, m) => sum + EST(m.content), 0),
      executedByTool,
      totalToolExecutions: Object.values(executedByTool).reduce(
        (a, b) => a + b,
        0,
      ),
      cachedServed: messages.filter(
        (m) => m.role === "tool" && String(m.content).includes("_cached"),
      ).length,
      perToolDenials: messages.filter(
        (m) =>
          m.role === "tool" &&
          /limit reached|denied by policy/.test(String(m.content)),
      ).length,
      progressNotes: messages.filter(
        (m) => m.role === "system" && String(m.content).includes("[Progress:"),
      ).length,
      guidanceInjected:
        messages.length > 0 &&
        String(messages[0].content).includes("CodeAtlas has provided context"),
    };
  } finally {
    sdk.close();
  }
}

describe("SDK tool-loop benchmark (option A)", () => {
  it("measures the SDK tool loop fix behavior over real fixture repos", async () => {
    const allResults: any[] = [];
    for (const repo of REPOS) {
      if (onlyRepo && repo.id !== onlyRepo) continue;
      const tasksData = JSON.parse(
        readFileSync(join(__dirname, "tasks", repo.tasksFile), "utf-8"),
      );
      // eslint-disable-next-line no-console
      console.log(`\n=== ${repo.id} — ${tasksData.name} ===`);
      if (!(await ensureIndexed(repo.path))) {
        // eslint-disable-next-line no-console
        console.error(`  ERROR: could not index ${repo.path}`);
        continue;
      }
      for (const task of tasksData.tasks ?? []) {
        if (onlyTask && task.id !== onlyTask) continue;
        const r = await runTask(repo, task);
        allResults.push(r);
        // eslint-disable-next-line no-console
        console.log(
          `  ${r.taskId} [${r.category}] ${r.ok ? "ok" : "ERR:" + r.error} score=${r.score} ` +
            `execCalls=${r.totalToolExecutions} (${Object.entries(
              r.executedByTool,
            )
              .map(([k, v]) => `${k}=${v}`)
              .join(" ")}) ` +
            `cached=${r.cachedServed} denied=${r.perToolDenials} progress=${r.progressNotes} guide=${r.guidanceInjected} tokens≈${r.tokenGuess}`,
        );
      }
    }

    const totals = {
      tasks: allResults.length,
      correct: allResults.filter((r) => r.score === 2).length,
      execCalls: allResults.reduce((a, r) => a + r.totalToolExecutions, 0),
      cached: allResults.reduce((a, r) => a + r.cachedServed, 0),
      denied: allResults.reduce((a, r) => a + r.perToolDenials, 0),
      progress: allResults.reduce((a, r) => a + r.progressNotes, 0),
      guidanceInjectedAll: allResults.every((r) => r.guidanceInjected),
    };
    const outDir = join(__dirname, "results", "sdk-tool-loop");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "report.json"),
      JSON.stringify(
        { generatedAt: new Date().toISOString(), totals, perTask: allResults },
        null,
        2,
      ),
    );

    // eslint-disable-next-line no-console
    console.log(`\n=== SDK TOOL LOOP SUMMARY ===`);
    // eslint-disable-next-line no-console
    console.log(
      `Tasks: ${totals.tasks}, correct: ${totals.correct}/${totals.tasks}`,
    );
    // eslint-disable-next-line no-console
    console.log(`Total tool executions (post-fix loop): ${totals.execCalls}`);
    // eslint-disable-next-line no-console
    console.log(
      `Near-duplicate searches served from cache (Fix 2): ${totals.cached}`,
    );
    // eslint-disable-next-line no-console
    console.log(`Per-tool limit denials (Fix 5): ${totals.denied}`);
    // eslint-disable-next-line no-console
    console.log(`Progress notes triggered (Fix 3): ${totals.progress}`);
    // eslint-disable-next-line no-console
    console.log(
      `Guidance injected on first user msg (Fix 1): ${totals.guidanceInjectedAll}`,
    );
  }, 600_000);
});
