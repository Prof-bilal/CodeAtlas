import { type IndexResult, type SummaryPort, indexProject } from "@atlas/sdk";
import type { Command } from "commander";
import { resolveProjectRoot } from "./search";

/** Injectable services for {@link registerIndexingCommands}. */
export interface IndexingCommandOptions {
  /** Summary generation port override (defaults to the SDK's provider-backed port). */
  readonly summary?: SummaryPort;
}

interface IndexOptions {
  readonly repo?: string;
  readonly json?: boolean;
  readonly summaries?: boolean;
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
    .action(async (options: IndexOptions) => {
      const result = await indexProject({
        repositoryPath: options.repo ?? resolveProjectRoot(),
        mode,
        ...(options.summaries === true ? { summaries: true } : {}),
        ...(commandOptions.summary === undefined ? {} : { summary: commandOptions.summary }),
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
