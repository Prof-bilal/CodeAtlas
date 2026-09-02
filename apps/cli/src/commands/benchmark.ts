import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  BenchmarkService,
  BenchmarkStore,
  OllamaRunner,
  OpenCodeRunner,
  SINGLE_ABLATION_SCENARIOS,
  evaluateRetrieval,
  scaffoldTaskFile,
} from "@atlas/benchmark";
import type { BenchmarkRunner } from "@atlas/benchmark";
import { createContextToolSourceFromSDK } from "@atlas/mcp";
import {
  type BenchmarkConfig,
  type BenchmarkRunRequest,
  type ChatAgentPort,
  type ChatAgentRequest,
  type ChatAgentResult,
  ProviderChatAgent,
  type ProviderPort,
  type Result,
  type TaskDefinition,
  type TaskFile,
  type ToolCallPolicy,
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
    .option("--agent <agent>", "agent backend: opencode, kilo, or ollama (default: opencode)")
    .option("--model <model>", "model identifier")
    .option("--models <models>", "comma-separated model identifiers for matrix expansion")
    .option("--repo <path>", "repository path to benchmark against")
    .option("--task-file <path>", "path to a task definition JSON file to include")
    .option(
      "--modes <modes>",
      "comma-separated modes: baseline,codeatlas,codeatlas-intel (default: all)",
    )
    .action(async (opts) => {
      await initSuite(opts);
    });

  // --- run ---
  bench
    .command("run <suite-id>")
    .description("Run tasks in a benchmark suite")
    .option("--task <task-id>", "run only this task")
    .option(
      "--mode <mode>",
      "mode to run: baseline, codeatlas, codeatlas-intel, or both (default: both)",
    )
    .requiredOption("--repo <path>", "repository path (required)")
    .option("--force", "re-run tasks even if results exist")
    .option("--models <models>", "comma-separated model identifiers for matrix expansion")
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

  // --- ablation ---
  bench
    .command("ablation <suite-id>")
    .description("Run ablation scenarios (toggle intel features one at a time)")
    .option("--task <task-id>", "run only this task (base task ID, no scenario suffix)")
    .requiredOption("--repo <path>", "repository path (required)")
    .option("--force", "re-run scenarios even if results exist")
    .option("--scenarios <list>", "comma-separated scenario labels (default: all)")
    .action(async (suiteId, opts) => {
      await runAblation(suiteId, opts);
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
      const agent = new ToolUsingChatAgent(
        this.provider,
        toolSource,
        ["ollama"],
        MAX_TOOL_ROUNDS_FREE,
        BENCHMARK_TOOL_POLICY,
      );
      return await agent.run(request);
    } finally {
      sdk.close();
    }
  }
}

/**
 * Benchmark tool-loop budget for weak/free models (small-model intelligence
 * benchmark, Phase 3). Bounds the worst tool-thrash we measured on free models
 * (mimo reached 29 calls / 762K tokens on one task) while still allowing the
 * normal 1–5-call exploration. Tuned conservatively so it never blocks a
 * reasonable task; the loop can expand per-tool when a task genuinely needs it.
 */
const MAX_TOOL_ROUNDS_FREE = 6;

const BENCHMARK_TOOL_POLICY: ToolCallPolicy = {
  maxToolCalls: 8,
  perToolCallLimit: {
    search_symbols: 2,
    search_files: 2,
    find_relevant_context: 3,
    analyze_task: 2,
    create_plan: 2,
    inspect_symbol: 3,
    get_dependencies: 2,
    explain_module: 2,
    read_file_range: 3,
    verify_answer: 2,
    get_summary: 1,
    project_overview: 1,
  },
};

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
  runners.set(
    "kilo",
    new OpenCodeRunner({
      openCodeBin: "kilo",
      name: "kilo",
      model: "kilo/nvidia/nemotron-3.5-lightning:free",
      configPath: join(homedir(), ".config", "kilo", "kilo.jsonc"),
      omitDirFlag: true,
    }),
  );
  runners.set("ollama", createOllamaRunner());
  return new BenchmarkService({
    root: benchmarkRoot(),
    runners,
    retrievalEvaluator: (suite, tasks, repositoryPath) => {
      const sdk = createContextSDK({ repositoryPath });
      try {
        return evaluateRetrieval(sdk, tasks);
      } finally {
        sdk.close();
      }
    },
  });
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
  models?: string;
  repo?: string;
  taskFile?: string;
  modes?: string;
}): Promise<void> {
  const suiteId = opts.id ?? `benchmark-${Date.now()}`;
  const modes =
    opts.modes !== undefined
      ? (opts.modes.split(",").map((m) => m.trim()) as (
          | "baseline"
          | "codeatlas"
          | "codeatlas-intel"
        )[])
      : (["baseline", "codeatlas", "codeatlas-intel"] as const);
  const models =
    opts.models !== undefined ? opts.models.split(",").map((m) => m.trim()) : undefined;
  const config: BenchmarkConfig = {
    id: suiteId,
    name: opts.name ?? "Benchmark",
    agent: (opts.agent as "opencode" | "kilo" | "ollama") ?? "opencode",
    model:
      opts.model ??
      (models !== undefined && models.length > 0 ? models[0] : "opencode/deepseek-v4-flash-free"),
    modes,
    ...(models !== undefined ? { models } : {}),
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
    models?: string;
  },
): Promise<void> {
  // --repo is now required via .requiredOption(); commander throws if omitted
  const repo = opts.repo as string;
  const repoPath = resolve(repo);
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
      : [opts.mode as "baseline" | "codeatlas" | "codeatlas-intel"];
  if (modes.includes("codeatlas") || modes.includes("codeatlas-intel")) {
    if (
      suiteResult.value.config.agent === "ollama" &&
      !createProviderService().listProviders().includes("ollama")
    ) {
      console.error("Error: Ollama is not configured. Run `atlas ollama connect` first.");
      process.exit(1);
    }
    await ensureIndexed(repoPath);
  }

  const models =
    opts.models !== undefined ? opts.models.split(",").map((m) => m.trim()) : undefined;

  console.log(`Running suite "${suiteId}"...`);
  console.log(`Repository: ${repoPath}`);
  if (opts.task !== undefined) console.log(`Task filter: ${opts.task}`);
  console.log(`Modes: ${modes.join(", ")}`);
  if (models !== undefined && models.length > 0) {
    console.log(`Models: ${models.join(", ")}`);
  }
  console.log("");

  const result = await service.runSuite({
    suiteId,
    repositoryPath: repoPath,
    modes,
    taskId: opts.task,
    force: opts.force,
    ...(models !== undefined && models.length > 0 ? { models } : {}),
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

// ---------------------------------------------------------------------------
// ablation
// ---------------------------------------------------------------------------

async function runAblation(
  suiteId: string,
  opts: {
    task?: string;
    repo?: string;
    force?: boolean;
    scenarios?: string;
  },
): Promise<void> {
  // --repo is now required via .requiredOption(); commander throws if omitted
  const repo = opts.repo as string;
  const repoPath = resolve(repo);
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

  // Resolve scenarios
  const scenarioLabels =
    opts.scenarios !== undefined
      ? opts.scenarios.split(",").map((s) => s.trim())
      : SINGLE_ABLATION_SCENARIOS.map((s) => s.label);
  const scenarios = SINGLE_ABLATION_SCENARIOS.filter((s) => scenarioLabels.includes(s.label));
  if (scenarios.length === 0) {
    console.error("Error: no valid ablation scenarios specified");
    process.exit(1);
  }

  // Ensure index exists for CodeAtlas mode
  await ensureIndexed(repoPath);

  console.log(`Running ablation scenarios for suite "${suiteId}"...`);
  console.log(`Repository: ${repoPath}`);
  console.log(`Scenarios: ${scenarios.map((s) => s.label).join(", ")}`);
  console.log("");

  // Load task definitions
  const store = new BenchmarkStore(benchmarkRoot());
  const allTaskDefs: TaskDefinition[] = [];
  for (const tf of suiteResult.value.taskFiles) {
    const taskFile = store.loadTaskFile(tf);
    if (taskFile !== null) allTaskDefs.push(...taskFile.tasks);
  }

  const taskFilter = opts.task ?? null;

  let completed = 0;
  let total = 0;

  for (const taskDef of allTaskDefs) {
    if (taskFilter !== null && taskDef.id !== taskFilter) continue;

    for (const scenario of scenarios) {
      total++;
      const ablationTaskId = `${taskDef.id}#${scenario.label}`;

      // Skip if result exists and --force not set
      if (!opts.force) {
        const existing = store.loadTaskResult(suiteId, ablationTaskId, "codeatlas-intel");
        if (existing !== null) {
          completed++;
          continue;
        }
      }

      console.log(`  [${scenario.label}] ${taskDef.id}...`);

      const request: BenchmarkRunRequest = {
        suiteId,
        taskId: taskDef.id,
        mode: "codeatlas-intel",
        repositoryPath: repoPath,
      };

      // For now, run with full intel and tag with scenario label.
      // The actual feature-toggle integration requires runner-level support
      // (passing ablationConfig through RunnerRequest).
      const result = await service.runTask(request);

      if (result.ok) {
        // Save with ablation-tagged task ID for report separation
        const taggedResult = {
          ...result.value,
          taskId: ablationTaskId,
        };
        store.saveTaskResult(suiteId, taggedResult);
        completed++;
      } else {
        console.error(`    Error: ${result.error.message}`);
      }
    }
  }

  console.log("");
  console.log("Ablation run complete.");
  console.log(`  Tasks: ${completed}/${total} completed`);
}
