import type { ConfigurationTarget } from "@atlas/core";
import type { ConfigurationAdapter, ConfigurationContext } from "./configurator-adapter";
import { configPathFor } from "./configurator-adapter";

/**
 * The built-in configuration adapters (Task 23) — one per target
 * (Claude / Gemini / Codex / OpenCode / MCP / VS Code), mirroring the
 * `@atlas/providers` / `@atlas/agents` adapter pattern.
 *
 * The exact user-config files and JSON sections each agent CLI reads were
 * **not** live-verified in this repository (same caveat as the AI-CLI
 * `runMode` flags): they are the common, documented defaults, and the merge
 * logic never clobbers keys it does not own. Where a real tool uses a
 * different on-disk format (e.g. Codex uses `config.toml`), the adapter
 * documents its managed JSON segment and **refuses to merge into an
 * unparseable file** rather than risk overwriting unrelated user config.
 */

/**
 * The stdio MCP-server entry registered for an MCP-supporting tool under an
 * agent's MCP section (`mcpServers` / `mcp_servers` / `mcp`).
 */
function mcpEntry(ctx: ConfigurationContext): Readonly<Record<string, unknown>> {
  const version = ctx.toolVersion === null ? {} : { version: ctx.toolVersion };
  return { type: "stdio", command: ctx.toolName, args: [], registeredBy: "codeatlas", ...version };
}

/** The enablement marker written for a non-MCP tool under an agent's tools
 *  section (a CodeAtlas-managed segment, documented as best-effort). */
function toolEntry(ctx: ConfigurationContext): Readonly<Record<string, unknown>> {
  const version = ctx.toolVersion === null ? {} : { version: ctx.toolVersion };
  return { enabled: true, registeredBy: "codeatlas", ...version };
}

/**
 * Shared base for the four AI-CLI adapters: detects through `AgentPort`
 * (`requiresAgent` = its provider id), writes a JSON settings file under the
 * tool's user-config directory, and merges one section per tool
 * (`mcpServers` / `mcp_servers` / `mcp` for MCP tools, `tools` otherwise).
 */
abstract class CliAgentAdapter implements ConfigurationAdapter {
  public abstract readonly target: ConfigurationTarget;
  public abstract readonly label: string;
  public abstract readonly requiresAgent: string;
  /** Config sub-directory under the config home (e.g. `.claude`). */
  protected abstract readonly dirName: string;
  /** Config file name (e.g. `settings.json`). */
  protected abstract readonly fileName: string;
  /** The MCP section key of this agent's settings file. */
  protected abstract readonly mcpSectionKey: string;

  public configPath(ctx: ConfigurationContext): string {
    return configPathFor(ctx, this.dirName, this.fileName);
  }

  public rootKey(ctx: ConfigurationContext): string | null {
    return ctx.mcp ? this.mcpSectionKey : "tools";
  }

  public buildEntry(ctx: ConfigurationContext): Readonly<Record<string, unknown>> {
    return ctx.mcp ? mcpEntry(ctx) : toolEntry(ctx);
  }

  public describe(ctx: ConfigurationContext): string {
    const verb = ctx.mcp ? "Register MCP server" : "Enable tool";
    return `${verb} '${ctx.toolName}' for ${this.label} in ${this.configPath(ctx)}`;
  }
}

/**
 * Claude Code adapter — writes `~/.claude/settings.json`; registers MCP
 * servers under the `mcpServers` section (Claude Code's documented key for
 * managed stdio servers).
 */
export class ClaudeAdapter extends CliAgentAdapter {
  public readonly target = "claude" as const;
  public readonly label = "Claude";
  public readonly requiresAgent = "claude";
  protected readonly dirName = ".claude";
  protected readonly fileName = "settings.json";
  protected readonly mcpSectionKey = "mcpServers";
}

/**
 * Gemini CLI adapter — writes `~/.gemini/settings.json`; registers MCP
 * servers under the `mcpServers` section.
 */
export class GeminiAdapter extends CliAgentAdapter {
  public readonly target = "gemini" as const;
  public readonly label = "Gemini";
  public readonly requiresAgent = "gemini";
  protected readonly dirName = ".gemini";
  protected readonly fileName = "settings.json";
  protected readonly mcpSectionKey = "mcpServers";
}

/**
 * Codex CLI adapter — writes `~/.codex/config.json` (the CodeAtlas-managed
 * JSON segment of the Codex config directory). The real Codex CLI uses
 * `config.toml`; because this adapter only merges JSON, an existing
 * non-JSON/unparseable Codex file is reported as blocked and **never
 * overwritten** — related user config is protected by design. MCP servers are
 * registered under `mcp_servers` (Codex's documented key).
 */
export class CodexAdapter extends CliAgentAdapter {
  public readonly target = "codex" as const;
  public readonly label = "Codex";
  public readonly requiresAgent = "codex";
  protected readonly dirName = ".codex";
  protected readonly fileName = "config.json";
  protected readonly mcpSectionKey = "mcp_servers";
}

/**
 * OpenCode adapter — writes `~/.opencode/config.json`; registers MCP servers
 * under the `mcp` section using OpenCode's documented local-server shape
 * (`type: "local"`, command as an argument array).
 */
export class OpenCodeAdapter extends CliAgentAdapter {
  public readonly target = "opencode" as const;
  public readonly label = "OpenCode";
  public readonly requiresAgent = "opencode";
  protected readonly dirName = ".opencode";
  protected readonly fileName = "config.json";
  protected readonly mcpSectionKey = "mcp";

  public override buildEntry(ctx: ConfigurationContext): Readonly<Record<string, unknown>> {
    if (!ctx.mcp) {
      return toolEntry(ctx);
    }
    const version = ctx.toolVersion === null ? {} : { version: ctx.toolVersion };
    return {
      type: "local",
      command: [ctx.toolName],
      env: {},
      registeredBy: "codeatlas",
      ...version,
    };
  }
}

/**
 * MCP adapter — records the tool in the CodeAtlas-managed user-level MCP
 * server index (`~/.codeatlas/mcp/servers.json`), a top-level map keyed by
 * tool name that agents/`atlas tools doctor` can consume. Always present
 * (`requiresAgent: null` — nothing to detect); applicable only when the tool
 * declares MCP support.
 */
export class McpAdapter implements ConfigurationAdapter {
  public readonly target = "mcp" as const;
  public readonly label = "MCP";
  public readonly requiresAgent = null;

  public configPath(ctx: ConfigurationContext): string {
    return configPathFor(ctx, joinDotAtlasMcp(), "servers.json");
  }

  public rootKey(): string | null {
    return null;
  }

  public buildEntry(ctx: ConfigurationContext): Readonly<Record<string, unknown>> {
    const version = ctx.toolVersion === null ? {} : { version: ctx.toolVersion };
    return {
      type: "stdio",
      command: ctx.toolName,
      args: [],
      registeredBy: "codeatlas",
      registeredAt: ctx.timestamp,
      ...version,
    };
  }

  public describe(ctx: ConfigurationContext): string {
    return `Record tool '${ctx.toolName}' in the CodeAtlas MCP server index (${this.configPath(ctx)})`;
  }
}

function joinDotAtlasMcp(): string {
  return ".codeatlas/mcp";
}

/**
 * VS Code adapter — writes `<configHome>/.vscode/settings.json` with the
 * tool under a CodeAtlas-namespaced `codeatlas` section, so unrelated VS Code
 * settings keys are never shadowed. (Real VS Code user settings live in
 * per-OS paths; this is the documented best-effort MVP location — see the
 * file-header caveat.)
 */
export class VsCodeAdapter implements ConfigurationAdapter {
  public readonly target = "vscode" as const;
  public readonly label = "VS Code";
  public readonly requiresAgent = null;

  public configPath(ctx: ConfigurationContext): string {
    return configPathFor(ctx, ".vscode", "settings.json");
  }

  public rootKey(): string | null {
    return "codeatlas";
  }

  public buildEntry(ctx: ConfigurationContext): Readonly<Record<string, unknown>> {
    const version = ctx.toolVersion === null ? {} : { version: ctx.toolVersion };
    return { enabled: true, registeredBy: "codeatlas", ...version };
  }

  public describe(ctx: ConfigurationContext): string {
    return `Enable tool '${ctx.toolName}' in VS Code user settings (codeatlas.<tool>) in ${this.configPath(ctx)}`;
  }
}

/** Every built-in configuration adapter, in a stable order. */
export const builtinConfigurationAdapters: readonly ConfigurationAdapter[] = [
  new ClaudeAdapter(),
  new GeminiAdapter(),
  new CodexAdapter(),
  new OpenCodeAdapter(),
  new McpAdapter(),
  new VsCodeAdapter(),
];
