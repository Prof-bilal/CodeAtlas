import type { Command } from "commander";
import { printComingSoon } from "./coming-soon";

export function registerBuild(program: Command): void {
  program
    .command("build")
    .description("Build the CodeAtlas index for a project")
    .action(() => printComingSoon("build"));
}
