import type { Command } from "commander";
import { printComingSoon } from "./coming-soon";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize CodeAtlas in the current project")
    .action(() => printComingSoon("init"));
}
