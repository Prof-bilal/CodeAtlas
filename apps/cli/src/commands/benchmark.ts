import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BenchmarkService,
  BenchmarkStore,
  OllamaRunner,
  OpenCodeRunner,
  scaffoldTaskFile,
} from "@atlas/benchmark";
import type { BenchmarkRunner } from "@atlas/benchmark";
import { createContextToolSourceFromSDK } from "@atlas/mcp";
import type {
  BenchmarkConfig,
  ChatAgentPort,
  ChatAgentRequest,
  ChatAgentResult,
  ProviderPort,
  Result,
  TaskFile,
} from "@atlas/sdk";
import {
  ProviderChatAgent,
  ToolUsingChatAgent,
  createContextSDK,
  createProviderService,
  indexProject,
} from "@atlas/sdk";
import type { Command } from "commander";

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerBenchmark(program: Command): void {
  const bench = program
    .command("benchmark")
    .description("Run benchmark evaluations comparing baseline vs CodeAtlas context quality");

  // --- init ---
  bench
    .command("init")
    .description("Initialize a new benchmark suite")
    .option("--id <id>", "suite identifier (default: benchmark-<timestamp>)")
    .option("--name <name>", "display name (default: 'Benchmark')")
    .option("--agent <agent>", "agent backend: opencode or ollama (default: opencode)")
    .option("--model <model>", "model identifier")
    .option("--repo <path>", "repository path to benchmark against")
    .option("--task-file <path>", "path to a task definition JSON file to include")
    .action(async (opts) => {
      await initSuite(opts);
    });

  // --- run ---
  bench
    .command("run <suite-id>")
    .description("Run tasks in a benchmark suite")
    .option("--task <task-id>", "run only this task")
    .option("--mode <mode>", "mode to run: baseline, codeatlas, or both (default: both)")
    .option("--repo <path>", "repository path (required)")
    .option("--force", "re-run tasks even if results exist")
    .action(async (suiteId, opts) => {
      await runSuite(suiteId, opts);
    });

  // --- status ---
  bench
    .command("status <suite-id>")
    .description("Show benchmark suite progress")
    .option("--json", "print results as JSON")
    .action(async (suiteId, opts) => {
      await showStatus(suiteId, opts);
    });

  // --- report ---
  bench
    .command("report <suite-id>")
    .description("Generate a benchmark report")
    .option("--json", "output as JSON instead of Markdown")
    .option("--format <format>", "report format: markdown, json, or html (default: markdown)")
    .action(async (suiteId, opts) => {
      await generateReport(suiteId, opts);
    });

  // Bare `atlas benchmark` prints help
  bench.action(() => {
    bench.help();
  });
}

// ---------------------------------------------------------------------------
// Ollama runner composition
// ---------------------------------------------------------------------------

/**
 * CodeAtlas-mode chat agent for Ollama benchmark runs: opens the repository's
 * Context SDK per task and runs the bounded tool loop against the MCP context
 * tools (reusing the exact tool definitions MCP serves — no second registry).
 */
class RepositoryToolLoopAgent implements ChatAgentPort {
  public readonly providers = ["ollama"];

  public constructor(private readonly provider: ProviderPort) {}

  public handles(provider: string): boolean {
    return provider === "ollama";
  }

  public async run(request: ChatAgentRequest): Promise<Result<ChatAgentResult>> {
    const sdk = createContextSDK({ repositoryPath: request.repositoryPath });
    try {
      const toolSource = createContextToolSourceFromSDK(sdk);
      const agent = new ToolUsingChatAgent(this.provider, toolSource, ["ollama"]);
      return await agent.run(request);
    } finally {
      sdk.close();
    }
  }
}

function createOllamaRunner(): OllamaRunner {
  const providers = createProviderService();
  return new OllamaRunner({
    baseline: new ProviderChatAgent(providers, ["ollama"]),
    codeatlas: new RepositoryToolLoopAgent(providers),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function benchmarkRoot(): string {
  return resolve(process.cwd(), ".codeatlas", "benchmarks");
}

function openService(): BenchmarkService {
  const runners = new Map<string, BenchmarkRunner>();
  runners.set("opencode", new OpenCodeRunner());
  runners.set("ollama", createOllamaRunner());
  return new BenchmarkService({ root: benchmarkRoot(), runners });
}

/** Path of the repository's context database (used to detect an existing index). */
function contextDbPath(repositoryPath: string): string {
  return resolve(repositoryPath, ".codeatlas", "context.db");
}

/** Ensure the repository is indexed before a CodeAtlas-mode run. */
async function ensureIndexed(repositoryPath: string): Promise<void> {
  if (existsSync(contextDbPath(repositoryPath))) {
    return;
  }
  console.log("No CodeAtlas index found — indexing repository…");
  const result = await indexProject({ repositoryPath, mode: "build" });
  if (!result.ok) {
    console.error(`Error: indexing failed: ${result.error.message}`);
    process.exit(1);
  }
  console.log("Indexing complete.");
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

async function initSuite(opts: {
  id?: string;
  name?: string;
  agent?: string;
  model?: string;
  repo?: string;
  taskFile?: string;
}): Promise<void> {
  const suiteId = opts.id ?? `benchmark-${Date.now()}`;
  const config: BenchmarkConfig = {
    id: suiteId,
    name: opts.name ?? "Benchmark",
    agent: (opts.agent as "opencode" | "ollama") ?? "opencode",
    model: opts.model ?? "opencode/deepseek-v4-flash-free",
    modes: ["baseline", "codeatlas"],
  };

  const service = openService();
  const result = await service.initSuite(config);

  if (!result.ok) {
    console.error(`Error: ${result.error.message}`);
    process.exit(1);
  }

  console.log(`Suite "${suiteId}" created.`);
  console.log(`Config written to ${benchmarkRoot()}/suites/${suiteId}/suite.json`);

  // Add task file if provided
  if (opts.taskFile !== undefined && existsSync(opts.taskFile)) {
    const taskContent = JSON.parse(readFileSync(opts.taskFile, "utf-8")) as TaskFile;
    const store = new BenchmarkStore(benchmarkRoot());
    store.saveTaskFile(taskContent, `${suiteId}-tasks.json`);
    const suite = result.value;
    store.saveSuite({ ...suite, taskFiles: [`${suiteId}-tasks.json`] });
    console.log(`Task file "${opts.taskFile}" added (${taskContent.tasks.length} tasks).`);
  } else if (opts.repo !== undefined) {
    // Generate starter task file
    const taskFile = scaffoldTaskFile("repo-01", "repository", opts.repo);
    const store = new BenchmarkStore(benchmarkRoot());
    store.saveTaskFile(taskFile, `${suiteId}-tasks.json`);
    const suite = result.value;
    store.saveSuite({ ...suite, taskFiles: [`${suiteId}-tasks.json`] });
    console.log(`Starter task file generated (${taskFile.tasks.length} tasks).`);
    console.log("Edit the task file to add expected_files and expected_concepts.");
  } else {
    console.log(
      "No task file provided. Add task files manually to .codeatlas/benchmarks/task-files/",
    );
  }
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

async function runSuite(
  suiteId: string,
  opts: {
    task?: string;
    mode?: string;
    repo?: string;
    force?: boolean;
  },
): Promise<void> {
  if (opts.repo === undefined) {
    console.error("Error: --repo <path> is required");
    process.exit(1);
  }

  const repoPath = resolve(opts.repo);
  if (!existsSync(repoPath)) {
    console.error(`Error: repository path "${opts.repo}" does not exist`);
    process.exit(1);
  }

  const service = openService();
  const suiteResult = await service.loadSuite(suiteId);
  if (!suiteResult.ok) {
    console.error(`Error: ${suiteResult.error.message}`);
    process.exit(1);
  }

  // Resolve the effective modes up front so the index is built only when a
  // CodeAtlas-mode run will actually happen (both agents read it in that mode).
  const modes =
    opts.mode === undefined || opts.mode === "both"
      ? suiteResult.value.config.modes
      : [opts.mode as "baseline" | "codeatlas"];
  if (modes.includes("codeatlas")) {
    if (
      suiteResult.value.config.agent === "ollama" &&
      !createProviderService().listProviders().includes("ollama")
    ) {
      console.error("Error: Ollama is not configured. Run `atlas ollama connect` first.");
      process.exit(1);
    }
    await ensureIndexed(repoPath);
  }

  console.log(`Running suite "${suiteId}"...`);
  console.log(`Repository: ${repoPath}`);
  if (opts.task !== undefined) console.log(`Task filter: ${opts.task}`);
  console.log(`Modes: ${modes.join(", ")}`);
  console.log("");

  const result = await service.runSuite({
    suiteId,
    repositoryPath: repoPath,
    modes,
    taskId: opts.task,
    force: opts.force,
  });

  if (!result.ok) {
    console.error(`Error: ${result.error.message}`);
    process.exit(1);
  }

  const sr = result.value;
  console.log("");
  console.log("Suite run complete.");
  console.log(`  Tasks executed: ${sr.tasks.length}`);
  console.log(`  Token savings: ${sr.tokenSavings.toLocaleString()}`);
  console.log(`  Cost savings: $${sr.costSavings.toFixed(4)}`);
  console.log(
    `  Accuracy delta: ${sr.accuracyDelta >= 0 ? "+" : ""}${sr.accuracyDelta.toFixed(2)}`,
  );
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

async function showStatus(suiteId: string, opts: { json?: boolean }): Promise<void> {
  const service = openService();
  const result = await service.getStatus(suiteId);

  if (!result.ok) {
    console.error(`Error: ${result.error.message}`);
    process.exit(1);
  }

  const status = result.value;

  if (opts.json === true) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log("");
  console.log(`  Suite:     ${status.suiteId}`);
  console.log(`  Status:    ${status.status}`);
  console.log(`  Progress:  ${status.completed}/${status.total} tasks`);
  console.log(`  Updated:   ${status.updatedAt}`);
  console.log("");
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

async function generateReport(
  suiteId: string,
  opts: { json?: boolean; format?: string },
): Promise<void> {
  const format = opts.json === true ? "json" : (opts.format ?? "markdown");
  if (format !== "markdown" && format !== "json" && format !== "html") {
    console.error(`Error: unknown format "${format}" (expected markdown, json, or html)`);
    process.exit(1);
  }

  const service = openService();
  const result = await service.generateReport(suiteId, { format });

  if (!result.ok) {
    console.error(`Error: ${result.error.message}`);
    process.exit(1);
  }

  console.log(result.value.content);
}
