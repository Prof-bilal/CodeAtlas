import { Command } from "commander";
import { VERSION } from "@atlas/sdk";
import { registerCommands } from "./commands/index";

/** Build and configure the `atlas` CLI program (no side effects). */
export function createCli(): Command {
  const program = new Command();

  program
    .name("atlas")
    .description("CodeAtlas — an open-source AI Context Engine")
    .version(VERSION);

  registerCommands(program);

  return program;
}
