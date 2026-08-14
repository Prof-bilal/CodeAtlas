import { VERSION } from "@atlas/sdk";
import { Command } from "commander";
import type { AgentsCommandOptions } from "./commands/agents";
import type { ContextCommandOptions } from "./commands/context";
import { registerCommands } from "./commands/index";
import type { ToolsCommandOptions } from "./commands/tools";
import { runTui } from "./tui/shell";

/** Options for {@link createCli}. */
export interface CreateCliOptions
  extends ToolsCommandOptions,
    ContextCommandOptions,
    AgentsCommandOptions {
  /** Override the interactive TUI entry (tests inject a fake). */
  readonly runTui?: () => Promise<void>;
}

/** Build and configure the `atlas` CLI program (no side effects). */
export function createCli(options: CreateCliOptions = {}): Command {
  const program = new Command();
  const startTui = options.runTui ?? runTui;

  program
    .name("atlas")
    .description("CodeAtlas — an open-source AI Context Engine")
    .version(VERSION)
    .action(() => {
      // Bare `atlas` opens the interactive TUI on a real terminal; non-TTY
      // (CI, pipes) gets plain help instead of hanging on stdin.
      if (process.stdin.isTTY) {
        void startTui();
      } else {
        program.outputHelp();
      }
    });

  registerCommands(program, {
    ...(options.toolkit === undefined ? {} : { toolkit: options.toolkit }),
    ...(options.integration === undefined ? {} : { integration: options.integration }),
    ...(options.agentMcp === undefined ? {} : { agentMcp: options.agentMcp }),
  });

  return program;
}
