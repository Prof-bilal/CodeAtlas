import type { Command } from "commander";
import { printComingSoon } from "./coming-soon";

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Diagnose issues with a CodeAtlas installation")
    .action(() => printComingSoon("doctor"));
}
