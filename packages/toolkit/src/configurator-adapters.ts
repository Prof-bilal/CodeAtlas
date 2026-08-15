import type { ConfigurationTarget } from "@atlas/core";
import type {
  ConfigFormat,
  ConfigurationAdapter,
  ConfigurationContext,
} from "./configurator-adapter";
import { configPathFor } from "./configurator-adapter";

/**
 * The built-in configuration adapters (Task 23) — one per target
 * (Claude / Gemini / Codex / OpenCode / MCP / VS Code), mirroring the
 * `@atlas/providers` / `@atlas/agents` adapter pattern.
 *
 * The exact user-config files and sections each agent CLI reads (ADR-010):
 * Claude Code reads `~/.claude.json` (it silently ignores `mcpServers` in
 * `settings.json`), Gemini reads `~/.gemini/settings.json` (a strict schema
 * unknown keys invalidate the whole file), Codex reads TOML from
 * `~/.codex/config.toml`, and OpenCode reads JSONC from
 * `~/.config/opencode/opencode.jsonc`. The merge logic never clobbers keys it
 * does not own, and an unparseable file is reported as blocked rather than
 * overwritten.
 */

/**
 * The stdio MCP-server entry registered for an MCP-supporting tool under an
 * agent's MCP section (`mcpServers` / `mcp_servers` / `mcp`). Written to match
 * each agent's schema: no provenance keys (Gemini rejects them) — CodeAtlas
 * records provenance in its own MCP index instead.
 */
function mcpEntry(ctx: ConfigurationContext): Readonly<Record<string, unknown>> {
  return { type: "stdio", command: ctx.toolName, args: [] };
}

/** The enablement marker written for a non-MCP tool under an agent's tools
 *  section (a CodeAtlas-managed segment, documented as best-effort). */
function toolEntry(): Readonly<Record<string, unknown>> {
  return { enabled: true };
}

/**
 * Shared base for the four AI-CLI adapters: detects through `AgentPort`
 * (`requiresAgent` = its provider id), writes a config file under the tool's
 * user-config directory, and merges one section per tool
 * (`mcpServers` / `mcp_servers` / `mcp` for MCP tools, `tools` otherwise).
 */
abstract class CliAgentAdapter implements ConfigurationAdapter {
  public abstract readonly target: ConfigurationTarget;
  public abstract readonly label: string;
  public abstract readonly requiresAgent: string;
  /** Config sub-directory under the config home (e.g. `.claude`), or `null`
   *  for a file directly in the config home (e.g. Claude's `~/.claude.json`). */
  protected abstract readonly dirName: string | null;
  /** Config file name (e.g. `settings.json`). */
  protected abstract readonly fileName: string;
  /** The MCP section key of this agent's settings file. */
  protected abstract readonly mcpSectionKey: string;
  /** The on-disk document format (default JSON; Codex is TOML, OpenCode
   *  JSONC). */
  public readonly format: ConfigFormat = "json";

  public configPath(ctx: ConfigurationContext): string {
    return configPathFor(ctx, this.dirName, this.fileName);
  }

  public rootKey(ctx: ConfigurationContext): string | null {
    return ctx.mcp ? this.mcpSectionKey : "tools";
  }

  public buildEntry(ctx: ConfigurationContext): Readonly<Record<string, unknown>> {
    return ctx.mcp ? mcpEntry(ctx) : toolEntry();
  }

  public describe(ctx: ConfigurationContext): string {
    const verb = ctx.mcp ? "Register MCP server" : "Enable tool";
    return `${verb} '${ctx.toolName}' for ${this.label} in ${this.configPath(ctx)}`;
  }
}

/**
 * Claude Code adapter — writes `~/.claude.json` (top-level `mcpServers`).
 * Claude Code **silently ignores** `mcpServers` placed in `settings.json`;
 * user-scope servers live in `~/.claude.json` under the top-level `mcpServers`
 * key — exactly what `claude mcp add --scope user` writes.
 */
export class ClaudeAdapter extends CliAgentAdapter {
  public readonly target = "claude" as const;
  public readonly label = "Claude";
  public readonly requiresAgent = "claude";
  protected readonly dirName = null;
  protected readonly fileName = ".claude.json";
  protected readonly mcpSectionKey = "mcpServers";
  public override readonly format: ConfigFormat = "json";
}

/**
 * Gemini CLI adapter — writes `~/.gemini/settings.json`; registers MCP
 * servers under the `mcpServers` section. Gemini's `MCPServerConfig` schema is
 * strict (`additionalProperties: false`): only the documented keys are
 * written, never provenance markers.
 */
export class GeminiAdapter extends CliAgentAdapter {
  public readonly target = "gemini" as const;
  public readonly label = "Gemini";
  public readonly requiresAgent = "gemini";
  protected readonly dirName = ".gemini";
  protected readonly fileName = "settings.json";
  protected readonly mcpSectionKey = "mcpServers";
  public override readonly format: ConfigFormat = "json";
}

/**
 * Codex CLI adapter — writes `~/.codex/config.toml` (the file the Codex CLI
 * actually reads) under `[mcp_servers.<tool>]`. TOML merges are surgical and
 * comment-preserving (`configurator-toml.ts`): every unrelated table, key, and
 * comment is kept byte-for-byte, and an unparseable line blocks the change
 * rather than risking a corrupt write.
 */
export class CodexAdapter extends CliAgentAdapter {
  public readonly target = "codex" as const;
  public readonly label = "Codex";
  public readonly requiresAgent = "codex";
  protected readonly dirName = ".codex";
  protected readonly fileName = "config.toml";
  protected readonly mcpSectionKey = "mcp_servers";
  public override readonly format: ConfigFormat = "toml";
}

/**
 * OpenCode adapter — writes `~/.config/opencode/opencode.jsonc` (JSONC);
 * registers MCP servers under the `mcp` section using OpenCode's documented
 * local-server shape (`type: "local"`, command as an argument array, `enabled`,
 * `environment`).
 */
export class OpenCodeAdapter extends CliAgentAdapter {
  public readonly target = "opencode" as const;
  public readonly label = "OpenCode";
  public readonly requiresAgent = "opencode";
  protected readonly dirName = ".config/opencode";
  protected readonly fileName = "opencode.jsonc";
  protected readonly mcpSectionKey = "mcp";
  public override readonly format: ConfigFormat = "jsonc";

  public override buildEntry(ctx: ConfigurationContext): Readonly<Record<string, unknown>> {
    if (!ctx.mcp) {
      return toolEntry();
    }
    return {
      type: "local",
      command: [ctx.toolName],
      enabled: true,
      environment: {},
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
