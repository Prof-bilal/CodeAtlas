import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  type IndexResult,
  type MetricsPort,
  type SummaryPort,
  type ToolkitSDK,
  type UsagePort,
  createToolkitSDK,
  indexProject,
} from "@atlas/sdk";
import type { Command } from "commander";
import { openMetrics } from "./metrics";
import { resolveProjectRoot } from "./search";
import { openUsage } from "./usage";

/** Injectable services for {@link registerIndexingCommands}. */
export interface IndexingCommandOptions {
  /** Summary generation port override (defaults to the SDK's provider-backed port). */
  readonly summary?: SummaryPort;
  /** Metrics port override (defaults to a `.codeatlas/metrics.json` service). */
  readonly metrics?: MetricsPort;
  /** Usage port override (defaults to a `.codeatlas/usage.db` service). */
  readonly usage?: UsagePort;
  /** Toolkit override for the post-init recommended-tools offer. */
  readonly toolkit?: ToolkitSDK;
  /** Injectable interactive prompt (tests); default reads stdin. */
  readonly prompt?: (question: string) => Promise<string>;
}

interface IndexOptions {
  readonly repo?: string;
  readonly json?: boolean;
  readonly summaries?: boolean;
  readonly tools?: string;
}

export function registerIndexingCommands(
  program: Command,
  options: IndexingCommandOptions = {},
): void {
  register(program, "init", "Initialize and index the current project", "build", options);
  register(program, "build", "Build the CodeAtlas index for a project", "build", options);
  register(
    program,
    "update",
    "Incrementally update an existing CodeAtlas index",
    "update",
    options,
  );
}

function register(
  program: Command,
  name: "init" | "build" | "update",
  description: string,
  mode: "build" | "update",
  commandOptions: IndexingCommandOptions,
): void {
  program
    .command(name)
    .description(description)
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--json", "print the indexing result as JSON")
    .option("--summaries", "generate AI file summaries for the indexed files")
    .option("--tools <choice>", "tool selection for the post-init offer (all | none | 1,2,3)")
    .action(async (options: IndexOptions) => {
      const root = options.repo === undefined ? resolveProjectRoot() : resolve(options.repo);
      const metrics = commandOptions.metrics ?? openMetrics(root);
      const usage = commandOptions.usage ?? openUsage(root);
      try {
        const result = await indexProject({
          repositoryPath: root,
          mode,
          ...(options.summaries === true ? { summaries: true } : {}),
          ...(commandOptions.summary === undefined ? {} : { summary: commandOptions.summary }),
          metrics,
          usage,
        });
        if (!result.ok) {
          console.error(result.error.message);
          process.exitCode = 1;
          return;
        }
        console.log(
          options.json === true
            ? JSON.stringify(result.value, null, 2)
            : render(result.value, options.summaries === true),
        );
        if (name === "init") {
          await offerRecommendedTools(commandOptions, options.tools);
        }
      } finally {
        metrics.flush();
        metrics.close();
        usage.close();
      }
    });
}

function render(result: IndexResult, withSummaries: boolean): string {
  const lines = [
    `Indexed ${result.repositoryPath}`,
    `Files: ${result.files} (parsed ${result.parsedFiles}, skipped ${result.skippedFiles})`,
    `Symbols: ${result.symbols}`,
    `Dependencies: ${result.dependencies}`,
    `Changes: +${result.added} ~${result.changed} -${result.deleted} =${result.unchanged}`,
    `Database: ${result.dbPath}`,
    `Manifest: ${result.manifestPath}`,
  ];
  if (withSummaries) {
    lines.push(`Summaries: ${result.summaries} (${result.summariesFailed} failed)`);
  }
  return lines.join("\n");
}

/**
 * After a successful `atlas init`, ask the user which of the recommended
 * (curated Top-10) tools they want installed, then install the selection.
 * Selecting a tool is the explicit approval; nothing is installed otherwise.
 * A `--tools` flag (all | none | 1,2,3) makes the flow scriptable.
 */
async function offerRecommendedTools(
  options: IndexingCommandOptions,
  choice: string | undefined,
): Promise<void> {
  const toolkit = options.toolkit ?? createToolkitSDK();
  const overview = await toolkit.overview();
  if (!overview.ok) return;
  const installed = new Set(overview.value.installed.map((tool) => tool.name));
  const candidates = overview.value.recommended.filter((tool) => !installed.has(tool.name));
  if (candidates.length === 0) {
    console.log("Recommended tools are already installed.");
    return;
  }

  let selection: readonly number[];
  if (choice !== undefined) {
    const parsed = parseToolSelection(choice, candidates.length);
    if (!parsed.ok) {
      console.error(parsed.error);
      process.exitCode = 1;
      return;
    }
    selection = parsed.value;
  } else {
    const prompt = options.prompt ?? defaultPrompt;
    console.log("Recommended tools for CodeAtlas:");
    candidates.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name} — ${tool.description}`);
    });
    const answer = await prompt(
      "Which tools should CodeAtlas install? (comma-separated numbers, 'all', or 'none') ",
    );
    const parsed = parseToolSelection(answer.trim(), candidates.length);
    if (!parsed.ok) {
      console.error(parsed.error);
      process.exitCode = 1;
      return;
    }
    selection = parsed.value;
  }

  if (selection.length === 0) {
    console.log("Skipped installing recommended tools.");
    return;
  }

  for (const index of selection) {
    const tool = candidates[index];
    if (tool === undefined) continue;
    console.log(`\nInstalling ${tool.name}...`);
    const plan = await toolkit.planInstall(tool.name);
    if (!plan.ok) {
      console.error(`  ${plan.error.message}`);
      continue;
    }
    const outcome = await toolkit.install(tool.name, { granted: true });
    if (!outcome.ok) {
      console.error(`  ${outcome.error.message}`);
      continue;
    }
    console.log(`  Installed (verification: ${outcome.value.verification}).`);
  }
}

export function parseToolSelection(
  input: string,
  count: number,
):
  | { readonly ok: true; readonly value: readonly number[] }
  | { readonly ok: false; readonly error: string } {
  if (input === "all") return { ok: true, value: Array.from({ length: count }, (_, i) => i) };
  if (input === "none") return { ok: true, value: [] };
  const parts = input
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) {
    return { ok: false, error: "No tools selected." };
  }
  const indexes: number[] = [];
  for (const part of parts) {
    const index = Number(part);
    if (!Number.isInteger(index) || index < 1 || index > count) {
      return {
        ok: false,
        error: `Invalid selection '${part}'. Enter numbers 1-${count}, 'all', or 'none'.`,
      };
    }
    if (!indexes.includes(index - 1)) indexes.push(index - 1);
  }
  return { ok: true, value: indexes };
}

function defaultPrompt(question: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = readline.question(question);
  void answer.finally(() => readline.close());
  return answer;
}
