import { type IndexResult, indexProject } from "@atlas/sdk";
import type { Command } from "commander";
import { resolveProjectRoot } from "./search";

interface IndexOptions {
  readonly repo?: string;
  readonly json?: boolean;
}

export function registerIndexingCommands(program: Command): void {
  register(program, "init", "Initialize and index the current project", "build");
  register(program, "build", "Build the CodeAtlas index for a project", "build");
  register(program, "update", "Incrementally update an existing CodeAtlas index", "update");
}

function register(
  program: Command,
  name: "init" | "build" | "update",
  description: string,
  mode: "build" | "update",
): void {
  program
    .command(name)
    .description(description)
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--json", "print the indexing result as JSON")
    .action(async (options: IndexOptions) => {
      const result = await indexProject({
        repositoryPath: options.repo ?? resolveProjectRoot(),
        mode,
      });
      if (!result.ok) {
        console.error(result.error.message);
        process.exitCode = 1;
        return;
      }
      console.log(
        options.json === true ? JSON.stringify(result.value, null, 2) : render(result.value),
      );
    });
}

function render(result: IndexResult): string {
  return [
    `Indexed ${result.repositoryPath}`,
    `Files: ${result.files} (parsed ${result.parsedFiles}, skipped ${result.skippedFiles})`,
    `Symbols: ${result.symbols}`,
    `Dependencies: ${result.dependencies}`,
    `Changes: +${result.added} ~${result.changed} -${result.deleted} =${result.unchanged}`,
    `Database: ${result.dbPath}`,
    `Manifest: ${result.manifestPath}`,
  ].join("\n");
}
