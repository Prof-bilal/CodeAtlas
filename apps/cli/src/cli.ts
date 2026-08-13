import { Command } from "commander";
import { VERSION } from "@atlas/sdk";
import { registerCommands } from "./commands/index";
import type { ToolsCommandOptions } from "./commands/tools";

/** Build and configure the `atlas` CLI program (no side effects). */
export function createCli(
  options: { readonly toolkit?: ToolsCommandOptions["toolkit"] } = {},
): Command {
  const program = new Command();

  program
    .name("atlas")
    .description("CodeAtlas — an open-source AI Context Engine")
    .version(VERSION);

  registerCommands(program, options.toolkit === undefined ? {} : { toolkit: options.toolkit });

  return program;
}
