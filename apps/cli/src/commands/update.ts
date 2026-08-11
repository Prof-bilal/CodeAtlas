import type { Command } from "commander";
import { printComingSoon } from "./coming-soon";

export function registerUpdate(program: Command): void {
  program
    .command("update")
    .description("Update an existing CodeAtlas index")
    .action(() => printComingSoon("update"));
}
