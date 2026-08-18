import { Command } from "commander";
import pkg from "../package.json";
import type { AgentsCommandOptions } from "./commands/agents";
import type { ContextCommandOptions } from "./commands/context";
import type { DoctorCommandOptions } from "./commands/doctor";
import { registerCommands } from "./commands/index";
import type { IndexingCommandOptions } from "./commands/indexing";
import type { SearchCommandOptions } from "./commands/search";
import type { SessionsCommandOptions } from "./commands/sessions";
import type { ToolsCommandOptions } from "./commands/tools";

/** Options for {@link createCli}. */
export interface CreateCliOptions
  extends ToolsCommandOptions,
    ContextCommandOptions,
    AgentsCommandOptions,
    DoctorCommandOptions,
    SessionsCommandOptions,
    SearchCommandOptions,
    Pick<IndexingCommandOptions, "prompt"> {}

/** Build and configure the `atlas` CLI program (no side effects). */
export function createCli(options: CreateCliOptions = {}): Command {
  const program = new Command();

  program
    .name("atlas")
    .description("CodeAtlas — an open-source AI Context Engine")
    .version(pkg.version)
    .action(() => {
      // Bare `atlas` prints help; the interactive TUI is a v2 follow-up.
      program.outputHelp();
    });

  registerCommands(program, {
    ...(options.toolkit === undefined ? {} : { toolkit: options.toolkit }),
    ...(options.integration === undefined ? {} : { integration: options.integration }),
    ...(options.agentMcp === undefined ? {} : { agentMcp: options.agentMcp }),
    ...(options.doctor === undefined ? {} : { doctor: options.doctor }),
    ...(options.sessions === undefined ? {} : { sessions: options.sessions }),
    ...(options.summary === undefined ? {} : { summary: options.summary }),
    ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
  });

  return program;
}
