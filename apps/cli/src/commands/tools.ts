import { createConfigurator } from "@atlas/sdk";
import type { Command } from "commander";

interface ConfigureOptions {
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly agent?: string[];
  readonly mcp?: boolean;
  readonly vscode?: boolean;
  readonly configHome?: string;
}

export function registerTools(program: Command): void {
  const tools = program.command("tools").description("Manage installed toolkit integrations");
  tools
    .command("configure <tool>")
    .description("Configure an installed tool for supported, installed agents")
    .option("--agent <agent...>", "agent ids declared by the tool")
    .option("--mcp", "the tool provides an MCP server")
    .option("--vscode", "the tool supports VS Code")
    .option("--config-home <path>", "user configuration root (for testing or managed environments)")
    .option("--dry-run", "render changes without writing")
    .option("--json", "print the plan/result as JSON")
    .action(async (tool: string, options: ConfigureOptions) => {
      const result = await createConfigurator().configure(
        {
          toolName: tool,
          ...(options.agent !== undefined ? { supportedAgents: options.agent } : {}),
          ...(options.mcp === true ? { mcp: true } : {}),
          ...(options.vscode === true ? { vscode: true } : {}),
          ...(options.configHome !== undefined ? { configHome: options.configHome } : {}),
        },
        { dryRun: options.dryRun === true },
      );
      if (!result.ok) {
        console.error(result.error.message);
        process.exitCode = 1;
        return;
      }
      if (options.json === true || options.dryRun === true) {
        console.log(JSON.stringify(result.value, null, 2));
        return;
      }
      console.log(renderConfigureOutcome(result.value));
      if (result.value.failedTargets.length > 0) process.exitCode = 1;
    });
}

export function renderConfigureOutcome(outcome: {
  readonly dryRun: boolean;
  readonly appliedTargets: readonly string[];
  readonly verifiedTargets: readonly string[];
  readonly skippedTargets: readonly string[];
  readonly failedTargets: readonly { target: string; error: string }[];
}): string {
  const lines = [outcome.dryRun ? "Configuration dry run" : "Configuration complete"];
  if (outcome.appliedTargets.length > 0)
    lines.push(`Applied: ${outcome.appliedTargets.join(", ")}`);
  if (outcome.verifiedTargets.length > 0)
    lines.push(`Verified: ${outcome.verifiedTargets.join(", ")}`);
  if (outcome.skippedTargets.length > 0)
    lines.push(`Already configured: ${outcome.skippedTargets.join(", ")}`);
  for (const failure of outcome.failedTargets)
    lines.push(`Failed (${failure.target}): ${failure.error}`);
  if (
    outcome.appliedTargets.length === 0 &&
    outcome.failedTargets.length === 0 &&
    outcome.skippedTargets.length === 0
  ) {
    lines.push("No applicable installed targets.");
  }
  return lines.join("\n");
}
