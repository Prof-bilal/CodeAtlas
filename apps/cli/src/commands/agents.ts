import {
  type AgentMcpPort,
  type AgentMcpStatus,
  type AgentMcpStatusEntry,
  type AgentMcpTarget,
  type ConfigureOutcome,
  createAgentMcpService,
} from "@atlas/sdk";
import type { Command } from "commander";

export interface AgentsCommandOptions {
  readonly agentMcp?: AgentMcpPort;
}

interface CommonOptions {
  readonly json?: boolean;
}

interface ConnectOptions extends CommonOptions {
  readonly dryRun?: boolean;
  readonly target?: string;
  readonly configHome?: string;
}

const AGENT_MCP_TARGETS: readonly AgentMcpTarget[] = [
  "claude",
  "gemini",
  "codex",
  "opencode",
  "cursor",
  "cline",
];

export function registerAgents(program: Command, options: AgentsCommandOptions = {}): void {
  const agents = program
    .command("agents")
    .description("Register the CodeAtlas MCP server for installed AI coding tools");

  agents.action(async (commandOptions: CommonOptions) => {
    const service = options.agentMcp ?? createAgentMcpService();
    const result = await service.status();
    if (!result.ok) return fail(result.error);
    emit(result.value, commandOptions, renderAgentMcpStatus);
  });

  agents
    .command("status")
    .description("Show each AI coding tool and its CodeAtlas MCP registration status")
    .option("--json", "print the status as JSON")
    .action(async (commandOptions: CommonOptions) => {
      const service = options.agentMcp ?? createAgentMcpService();
      const result = await service.status();
      if (!result.ok) return fail(result.error);
      emit(result.value, commandOptions, renderAgentMcpStatus);
    });

  agents
    .command("connect")
    .description("Register the CodeAtlas MCP server for installed, supported agents")
    .option(
      "--target <target>",
      "restrict to one target (claude, gemini, codex, opencode, cursor, cline)",
    )
    .option("--config-home <path>", "user configuration root (for testing or managed environments)")
    .option("--dry-run", "render changes without writing")
    .option("--json", "print the plan/result as JSON")
    .action(async (commandOptions: ConnectOptions) => {
      const targets = parseTargets(commandOptions.target);
      if (!targets.ok) {
        console.error(targets.error);
        process.exitCode = 1;
        return;
      }
      const service =
        options.agentMcp ??
        createAgentMcpService(
          commandOptions.configHome === undefined ? {} : { configHome: commandOptions.configHome },
        );
      const result = await service.configure({
        dryRun: commandOptions.dryRun === true,
        ...(targets.value.length > 0 ? { targets: targets.value } : {}),
      });
      if (!result.ok) return fail(result.error);
      emit(result.value, commandOptions, renderAgentsConnect);
    });
}

function parseTargets(
  raw: string | undefined,
): { ok: true; value: readonly AgentMcpTarget[] } | { ok: false; error: string } {
  if (raw === undefined) {
    return { ok: true, value: [] };
  }
  const target = raw.toLowerCase() as AgentMcpTarget;
  if (!(AGENT_MCP_TARGETS as readonly string[]).includes(target)) {
    return {
      ok: false,
      error: `Unknown target '${raw}'. Expected one of: ${AGENT_MCP_TARGETS.join(", ")}.`,
    };
  }
  return { ok: true, value: [target] };
}

function emit<T>(value: T, options: CommonOptions, render: (value: T) => string): void {
  console.log(options.json === true ? JSON.stringify(value, null, 2) : render(value));
}

function fail(error: Error): void {
  console.error(error.message);
  process.exitCode = 1;
}

export function renderAgentMcpStatus(status: AgentMcpStatus): string {
  const lines = [
    "AI Coding Tools — CodeAtlas MCP server",
    ...status.entries.map(renderEntry),
    status.needsConfiguration
      ? "Some installed tools still need the CodeAtlas MCP server. Run 'atlas agents connect'."
      : "The CodeAtlas MCP server is registered for every installed tool.",
  ];
  return lines.join("\n");
}

function renderEntry(entry: AgentMcpStatusEntry): string {
  if (!entry.available) {
    return `  ${entry.label.padEnd(10)} not installed`;
  }
  const state = entry.configured ? "✓ registered" : "○ not registered";
  return `  ${entry.label.padEnd(10)} ${state}  (${entry.filePath})`;
}

/** Render an agent-MCP connect result, including planned targets on dry runs
 *  (the shared tool renderer only prints applied/skipped/failed). */
export function renderAgentsConnect(outcome: ConfigureOutcome): string {
  const lines = [outcome.dryRun ? "Configuration dry run" : "Configuration complete"];
  const planned = outcome.dryRun === true ? outcome.changes.map((change) => change.target) : [];
  if (outcome.appliedTargets.length > 0)
    lines.push(`Applied: ${outcome.appliedTargets.join(", ")}`);
  if (outcome.verifiedTargets.length > 0)
    lines.push(`Verified: ${outcome.verifiedTargets.join(", ")}`);
  if (outcome.skippedTargets.length > 0)
    lines.push(`Already configured: ${outcome.skippedTargets.join(", ")}`);
  if (planned.length > 0) lines.push(`Would configure: ${planned.join(", ")}`);
  for (const failure of outcome.failedTargets)
    lines.push(`Failed (${failure.target}): ${failure.error}`);
  if (
    outcome.appliedTargets.length === 0 &&
    outcome.failedTargets.length === 0 &&
    outcome.skippedTargets.length === 0 &&
    planned.length === 0
  )
    lines.push("No applicable installed targets.");
  return lines.join("\n");
}
