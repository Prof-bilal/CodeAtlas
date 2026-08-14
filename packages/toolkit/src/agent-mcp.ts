import { homedir } from "node:os";
import type {
  AgentInfo,
  AgentMcpPort,
  AgentMcpStatus,
  AgentMcpStatusEntry,
  AgentMcpTarget,
  AgentPort,
  ConfigurationChange,
  ConfigurationTarget,
  ConfigurationTargetCheck,
  ConfigureOutcome,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import {
  type ConfigWriter,
  type ConfigurationAdapter,
  type ConfigurationContext,
  FsConfigWriter,
  applyConfigurationChange,
  buildConfigurationChange,
  configPathFor,
} from "./configurator-adapter";

export interface AgentMcpServiceOptions {
  /** Agent detection (`@atlas/agents`), injected exactly like the tool
   *  Configurator — never reimplemented here. */
  readonly agentPort: AgentPort;
  /** Project root the server entry's `ATLAS_ROOT` env points at. */
  readonly root?: string;
  /** I/O for user-config files, injectable for tests. */
  readonly writer?: ConfigWriter;
  /** User-config root; defaults to the OS home directory. */
  readonly configHome?: string;
  /** Command that starts the CodeAtlas MCP server (default `atlas`). */
  readonly command?: string;
  /** Args appended to the server command (default `["mcp"]`). */
  readonly args?: readonly string[];
  readonly now?: () => Date;
}

/** The MCP server entry registered for the `codeatlas` tool. */
function codeatlasEntry(
  root: string,
  command: string,
  args: readonly string[],
  local: boolean,
): Readonly<Record<string, unknown>> {
  const base = { env: { ATLAS_ROOT: root }, registeredBy: "codeatlas" };
  if (local) {
    return { ...base, type: "local", command: [command, ...args] };
  }
  return { ...base, type: "stdio", command, args };
}

/** One agent-MCP target adapter (Claude / Gemini / Codex / OpenCode / Cursor /
 *  Cline). Provider-specific config facts stay inside here, mirroring the tool
 *  Configurator's per-target adapters. */
class AgentMcpTargetAdapter implements ConfigurationAdapter {
  public readonly target: ConfigurationTarget;
  public readonly label: string;
  public readonly requiresAgent: string | null;

  private readonly dirName: string;
  private readonly fileName: string;
  private readonly sectionKey: string;
  private readonly root: string;
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly local: boolean;

  public constructor(
    target: AgentMcpTarget,
    label: string,
    requiresAgent: string | null,
    dirName: string,
    fileName: string,
    sectionKey: string,
    root: string,
    command: string,
    args: readonly string[],
    local = false,
  ) {
    this.target = target;
    this.label = label;
    this.requiresAgent = requiresAgent;
    this.dirName = dirName;
    this.fileName = fileName;
    this.sectionKey = sectionKey;
    this.root = root;
    this.command = command;
    this.args = args;
    this.local = local;
  }

  public configPath(ctx: ConfigurationContext): string {
    return configPathFor(ctx, this.dirName, this.fileName);
  }

  public rootKey(): string | null {
    return this.sectionKey;
  }

  public buildEntry(): Readonly<Record<string, unknown>> {
    return codeatlasEntry(this.root, this.command, this.args, this.local);
  }

  public describe(ctx: ConfigurationContext): string {
    return `Register the CodeAtlas MCP server 'codeatlas' for ${this.label} in ${this.configPath(ctx)}`;
  }
}

/** The `codeatlas` MCP-server entry key recorded under each agent's section. */
export const AGENT_MCP_TOOL_NAME = "codeatlas";

/**
 * Register the CodeAtlas MCP server (`codeatlas` stdio server) into the MCP
 * sections of installed AI coding tools, reusing the Configurator's
 * per-target adapter seam and its merge/backup/verify/rollback machinery
 * (`docs/MCP.md`). Never touches the analyzed repository — configuration is
 * written to **user config only**, and an unparseable existing file is
 * reported as blocked rather than overwritten.
 */
export class AgentMcpService implements AgentMcpPort {
  public readonly targets: readonly AgentMcpTarget[];
  private readonly adapters: readonly ConfigurationAdapter[];
  private readonly writer: ConfigWriter;
  private readonly agentPort: AgentPort;
  private readonly configHome: string;
  private readonly root: string;
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly now: () => Date;

  public constructor(options: AgentMcpServiceOptions) {
    this.agentPort = options.agentPort;
    this.root = options.root ?? process.cwd();
    this.writer = options.writer ?? new FsConfigWriter();
    this.configHome = options.configHome ?? homedir();
    this.command = options.command ?? "atlas";
    this.args = options.args ?? ["mcp"];
    this.now = options.now ?? (() => new Date());
    this.adapters = buildAdapters(this.root, this.command, this.args);
    this.targets = this.adapters.map((adapter) => adapter.target as AgentMcpTarget);
  }

  public async status(): Promise<Result<AgentMcpStatus>> {
    const agentResult = await this.agentPort.detectAll();
    if (!agentResult.ok) return fail(agentResult.error);
    const detected = new Map(agentResult.value.map((info) => [info.provider, info]));
    const context = this.context();
    const entries: AgentMcpStatusEntry[] = [];

    for (const adapter of this.adapters) {
      const info = adapter.requiresAgent === null ? undefined : detected.get(adapter.requiresAgent);
      const available = adapter.requiresAgent === null ? true : info?.available === true;
      const filePath = adapter.configPath(context);
      const existing = await this.writer.read(filePath);
      if (!existing.ok) return fail(existing.error);
      const change = buildConfigurationChange(adapter, context, existing.value);
      entries.push({
        target: adapter.target as AgentMcpTarget,
        label: adapter.label,
        available,
        filePath,
        configured: change.alreadyConfigured,
        detail: detailFor(adapter, info),
      });
    }

    return ok({
      entries,
      needsConfiguration: entries.some((entry) => entry.available && !entry.configured),
    });
  }

  public async configure(
    options: { readonly dryRun?: boolean; readonly targets?: readonly AgentMcpTarget[] } = {},
  ): Promise<Result<ConfigureOutcome>> {
    const selected = new Set(options.targets ?? this.targets);
    const agentResult = await this.agentPort.detectAll();
    if (!agentResult.ok) return fail(agentResult.error);
    const detected = new Map(agentResult.value.map((info) => [info.provider, info]));
    const context = this.context();

    const outcome: ConfigureOutcome = {
      toolName: AGENT_MCP_TOOL_NAME,
      configHome: this.configHome,
      dryRun: options.dryRun === true,
      appliedTargets: [],
      verifiedTargets: [],
      skippedTargets: [],
      failedTargets: [],
      targetChecks: [],
      changes: [],
    };
    const applied: string[] = [];
    const verified: string[] = [];
    const skipped: string[] = [];
    const failed: { target: string; label: string; error: string }[] = [];
    const targetChecks: ConfigurationTargetCheck[] = [];
    const changes: ConfigurationChange[] = [];

    for (const adapter of this.adapters) {
      if (!selected.has(adapter.target as AgentMcpTarget)) continue;
      const info = adapter.requiresAgent === null ? undefined : detected.get(adapter.requiresAgent);
      const available = adapter.requiresAgent === null ? true : info?.available === true;
      targetChecks.push({
        target: adapter.target as AgentMcpTarget,
        label: adapter.label,
        supported: true,
        available,
        applicable: available,
        detail: detailFor(adapter, info),
      });
      if (!available) continue;

      const existing = await this.writer.read(adapter.configPath(context));
      if (!existing.ok) return fail(existing.error);
      const change = buildConfigurationChange(adapter, context, existing.value);
      changes.push(change);

      if (change.problems.length > 0) {
        failed.push({
          target: adapter.target,
          label: adapter.label,
          error: change.problems.join("; "),
        });
      } else if (change.alreadyConfigured) {
        skipped.push(adapter.target);
      } else if (options.dryRun === true) {
        // Dry run: planned but nothing is written.
      } else {
        const result = await applyConfigurationChange(
          adapter,
          context,
          change,
          this.writer,
          this.now().toISOString(),
        );
        if (!result.ok) {
          failed.push({
            target: adapter.target,
            label: adapter.label,
            error: result.error.message,
          });
          continue;
        }
        applied.push(adapter.target);
        if (result.value.change.verified?.ok === true) verified.push(adapter.target);
      }
    }
    return ok({
      ...outcome,
      appliedTargets: applied,
      verifiedTargets: verified,
      skippedTargets: skipped,
      failedTargets: failed,
      targetChecks,
      changes,
    });
  }

  private context(): ConfigurationContext {
    return {
      toolName: AGENT_MCP_TOOL_NAME,
      toolVersion: null,
      mcp: true,
      configHome: this.configHome,
      timestamp: this.now().toISOString(),
    };
  }
}

function buildAdapters(
  root: string,
  command: string,
  args: readonly string[],
): readonly ConfigurationAdapter[] {
  const make = (
    target: AgentMcpTarget,
    label: string,
    requiresAgent: string | null,
    dirName: string,
    fileName: string,
    sectionKey: string,
    local = false,
  ) =>
    new AgentMcpTargetAdapter(
      target,
      label,
      requiresAgent,
      dirName,
      fileName,
      sectionKey,
      root,
      command,
      args,
      local,
    );
  return [
    make("claude", "Claude", "claude", ".claude", "settings.json", "mcpServers"),
    make("gemini", "Gemini", "gemini", ".gemini", "settings.json", "mcpServers"),
    make("codex", "Codex", "codex", ".codex", "config.json", "mcp_servers"),
    make("opencode", "OpenCode", "opencode", ".opencode", "config.json", "mcp", true),
    make("cursor", "Cursor", null, ".cursor", "mcp.json", "mcpServers"),
    make("cline", "Cline", null, ".cline", "cline_mcp_settings.json", "mcpServers"),
  ];
}

function detailFor(adapter: ConfigurationAdapter, info: AgentInfo | undefined): string | null {
  if (adapter.requiresAgent === null) return "host target is available";
  if (info?.available === true)
    return info.version === undefined ? "agent detected" : `agent detected (${info.version})`;
  return "agent is not installed or could not be detected";
}
