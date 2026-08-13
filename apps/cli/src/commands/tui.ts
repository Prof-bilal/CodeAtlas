import type { Command } from "commander";
import { type RunTuiOptions, runTui } from "../tui/shell";

/** CLI options for `atlas tui`. */
export type TuiCommandOptions = Pick<RunTuiOptions, "root">;

/** Register `atlas tui` (the interactive terminal UI). */
export function registerTui(program: Command): void {
  program
    .command("tui")
    .description(
      "Interactive TUI: /scan, /search, /context, /agents, /toolkit and direct AI CLI launch (/claude, /gemini, /codex, /opencode, ...)",
    )
    .option("--root <path>", "repository root (defaults to ATLAS_ROOT or the current directory)")
    .action(async (options: TuiCommandOptions) => {
      if (!process.stdin.isTTY) {
        console.log(
          "atlas tui is interactive and needs a real terminal. Run it directly, or use the CLI subcommands (atlas search, atlas context, ...) non-interactively.",
        );
        return;
      }
      await runTui({ ...(options.root === undefined ? {} : { root: options.root }) });
    });
}
