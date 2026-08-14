import type { Result } from "@atlas/shared";
import type { ConfigureOutcome } from "./configurator.port";

/**
 * The agent MCP-integration contract (Direction B, follow-up to Task 23).
 *
 * Registers **CodeAtlas's own MCP server** (the `codeatlas` stdio server, see
 * `docs/MCP.md`) into the MCP sections of installed AI coding tools — Claude,
 * Gemini, Codex, OpenCode, Cursor, and Cline — so those tools can query the
 * project's context index. This is separate from the tool-oriented
 * {@link ConfiguratorPort}, which wires *installed toolkit tools* into agents;
 * here the "tool" is always CodeAtlas itself.
 *
 * Provider-specific facts (config file, section key, entry shape) live inside
 * one adapter per target, exactly like the Configurator. Configuration is
 * written to **user config only** (never the analyzed repository), existing
 * config is merged/backed up/verified (never clobbered), and
 * `configure({ dryRun: true })` writes nothing. See `docs/MCP.md` and
 * `docs/SECURITY.md`.
 */
export interface AgentMcpPort {
  /** The targets this build can register the server into (all six). */
  readonly targets: readonly AgentMcpTarget[];

  /**
   * Report, per target, whether the tool is installed and whether the
   * `codeatlas` MCP server is already registered in its config. Read-only.
   */
  status(): Promise<Result<AgentMcpStatus>>;

  /**
   * Register the CodeAtlas MCP server for the applicable, installed targets.
   * With `options.dryRun === true` it renders the plan without writing. Each
   * target is applied independently and its result reported honestly
   * (`applied` / `verified` / `skipped` / `failed`).
   */
  configure(options?: {
    readonly dryRun?: boolean;
    readonly targets?: readonly AgentMcpTarget[];
  }): Promise<Result<ConfigureOutcome>>;
}

/** The AI coding tools the CodeAtlas MCP server can be registered into. */
export type AgentMcpTarget = "claude" | "gemini" | "codex" | "opencode" | "cursor" | "cline";

/** Status of one agent-MCP target. */
export interface AgentMcpStatusEntry {
  readonly target: AgentMcpTarget;
  /** Human label, e.g. `"Claude"`. */
  readonly label: string;
  /** The tool's CLI is installed (or a host target like Cursor/Cline is
   *  always present). */
  readonly available: boolean;
  /** Absolute user-config file the server entry lives in. */
  readonly filePath: string;
  /** True when the `codeatlas` entry is already registered correctly. */
  readonly configured: boolean;
  /** Human-readable evidence, or `null`. */
  readonly detail: string | null;
}

/** The full status report for all targets. */
export interface AgentMcpStatus {
  readonly entries: readonly AgentMcpStatusEntry[];
  /** True when at least one installed target still needs registration. */
  readonly needsConfiguration: boolean;
}
