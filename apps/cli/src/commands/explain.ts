import type { Command } from "commander";
import { printComingSoon } from "./coming-soon";

export function registerExplain(program: Command): void {
  program
    .command("explain")
    .description("Explain a symbol or concept using AI")
    .argument("[target]", "symbol or concept to explain")
    .action((_target?: string) => printComingSoon("explain"));
}
