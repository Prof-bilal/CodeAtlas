import { resolve } from "node:path";
import { createWatcher } from "@prof-bilal/atlas-sdk";
import type { Command } from "commander";
import { resolveProjectRoot } from "./search";

/** Parsed `atlas watch` CLI options. */
export interface WatchCliOptions {
  readonly repo?: string;
  readonly debounce?: string;
}

export function registerWatch(program: Command): void {
  program
    .command("watch")
    .description("Watch the repository and incrementally re-index on change")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--debounce <ms>", "debounce window in milliseconds", "300")
    .action(async (options: WatchCliOptions) => {
      const root = options.repo === undefined ? resolveProjectRoot() : resolve(options.repo);
      const debounceMs =
        options.debounce === undefined ? 300 : Number.parseInt(options.debounce, 10);
      if (!Number.isFinite(debounceMs) || debounceMs < 0) {
        throw new Error(`Invalid --debounce "${options.debounce}".`);
      }
      const watcher = createWatcher({
        repositoryPath: root,
        debounceMs,
        onIndex: (result) => {
          if (result.ok) {
            const value = result.value;
            console.log(
              `Re-indexed: +${value.added} ~${value.changed} -${value.deleted} =${value.unchanged} (${value.symbols} symbols)`,
            );
          } else {
            console.error(`Re-index failed: ${result.error.message}`);
          }
        },
        onError: (error) => console.error(`watch error: ${error.message}`),
      });
      await watcher.start();
      console.log(`Watching ${root} for changes (Ctrl-C to stop).`);
      const shutdown = (): void => {
        void watcher.close().finally(() => process.exit(0));
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
}
