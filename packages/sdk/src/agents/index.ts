import { AgentService, type AgentServiceOptions } from "@atlas/agents";
import type { AgentMcpPort, AgentPort } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { AgentMcpService, type AgentMcpServiceOptions } from "@atlas/toolkit";

/**
 * Build the agent connection layer (`AgentPort`): detects installed AI coding
 * CLIs (Claude Code, Gemini, Codex, OpenCode, …) and runs non-interactive
 * invocations of them. The CLI, MCP server, and VS Code extension reach the
 * agent layer through this SDK surface — never through `@atlas/agents` or
 * `node:child_process` directly.
 *
 * The session manager (`createSessionManager`) is the higher-level
 * session-tracking surface; `createAgentService` is the narrow detection/run
 * boundary the TUI and orchestration layers use.
 */
export function createAgentService(options: AgentServiceOptions = {}): AgentPort {
  return new AgentService(options);
}

export interface CreateAgentMcpServiceOptions extends Omit<AgentMcpServiceOptions, "agentPort"> {
  readonly agents?: AgentPort;
}

/**
 * Build the agent MCP-integration layer (`AgentMcpPort`): registers CodeAtlas's
 * own MCP server (`codeatlas` stdio server, see `docs/MCP.md`) into the MCP
 * sections of installed AI coding tools (Claude, Gemini, Codex, OpenCode,
 * Cursor, Cline). Composed over {@link createAgentService} for detection and
 * the Toolkit's configurator-adapter machinery for safe user-config merges.
 */
export function createAgentMcpService(options: CreateAgentMcpServiceOptions = {}): AgentMcpPort {
  const agents = options.agents ?? new AgentService();
  return new AgentMcpService({ ...options, agentPort: agents });
}

/**
 * Build the provider-specific argument array for an **interactive** AI CLI
 * launch: no non-interactive run-mode flags (no `-p`) and no prompt argument,
 * so the CLI opens its own terminal UI. Extra provider-specific args
 * (`--model`, …) are still forwarded. Provider-specific binary names and flags
 * stay inside the `@atlas/agents` adapters; consumers (the VS Code chat panel)
 * use this to spawn an interactive terminal without `if (provider === …)`.
 */
export function buildInteractiveArgs(
  provider: string,
  args?: readonly string[],
): Result<readonly string[]> {
  return new AgentService().buildArgsFor(provider, {
    prompt: "",
    ...(args !== undefined ? { args } : {}),
    interactive: true,
  });
}
