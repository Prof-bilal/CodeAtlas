import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import type {
  AgentInfo,
  AgentPort,
  ConfigurationChange,
  ConfigurationPlan,
  ConfigurationTarget,
  ConfigurationTargetCheck,
  ConfiguratorPort,
  ConfiguratorRequest,
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
  isConfigObject,
  parseConfigDocument,
} from "./configurator-adapter";
import { builtinConfigurationAdapters } from "./configurator-adapters";
import { ConfiguratorRequestError } from "./configurator-errors";

export interface ConfiguratorServiceOptions {
  readonly agentPort: AgentPort;
  readonly adapters?: readonly ConfigurationAdapter[];
  readonly writer?: ConfigWriter;
  readonly configHome?: string;
  readonly now?: () => Date;
}

/** Coordinates the target adapters without owning target-specific behavior. */
export class ConfiguratorService implements ConfiguratorPort {
  public readonly implementedTargets: readonly ConfigurationTarget[];
  private readonly adapters: readonly ConfigurationAdapter[];
  private readonly writer: ConfigWriter;
  private readonly agentPort: AgentPort;
  private readonly configHome: string;
  private readonly now: () => Date;

  public constructor(options: ConfiguratorServiceOptions) {
    this.adapters = options.adapters ?? builtinConfigurationAdapters;
    this.implementedTargets = this.adapters.map((adapter) => adapter.target);
    this.writer = options.writer ?? new FsConfigWriter();
    this.agentPort = options.agentPort;
    this.configHome = options.configHome ?? homedir();
    this.now = options.now ?? (() => new Date());
  }

  public async plan(request: ConfiguratorRequest): Promise<Result<ConfigurationPlan>> {
    const validated = validateRequest(request, this.implementedTargets);
    if (!validated.ok) return validated;
    const configHome = request.configHome ?? this.configHome;
    const context: ConfigurationContext = {
      toolName: request.toolName,
      toolVersion: request.toolVersion ?? null,
      mcp: request.mcp === true,
      configHome,
      timestamp: this.now().toISOString(),
    };
    const selected = new Set(request.targets ?? this.implementedTargets);
    const agentResult = await this.agentPort.detectAll();
    if (!agentResult.ok) return agentResult;
    const detected = new Map(agentResult.value.map((info) => [info.provider, info]));
    const targets: ConfigurationTargetCheck[] = [];
    const changes: ConfigurationChange[] = [];

    for (const adapter of this.adapters) {
      if (!selected.has(adapter.target)) continue;
      const supported = isSupported(request, adapter);
      const info = adapter.requiresAgent === null ? undefined : detected.get(adapter.requiresAgent);
      const available = adapter.requiresAgent === null ? true : info?.available === true;
      const applicable = supported && available;
      targets.push({
        target: adapter.target,
        label: adapter.label,
        supported,
        available,
        applicable,
        detail: detailFor(adapter, supported, info),
      });
      if (!applicable) continue;
      const existing = await this.writer.read(adapter.configPath(context));
      if (!existing.ok) return existing;
      changes.push(buildConfigurationChange(adapter, context, existing.value));
    }

    return ok({
      toolName: request.toolName,
      configHome,
      targets,
      changes,
      changesNeeded: changes.some(
        (change) => !change.alreadyConfigured && change.problems.length === 0,
      ),
    });
  }

  public async configure(
    request: ConfiguratorRequest,
    options: { readonly dryRun?: boolean } = {},
  ): Promise<Result<ConfigureOutcome>> {
    const planned = await this.plan(request);
    if (!planned.ok) return planned;
    const outcome: ConfigureOutcome = {
      toolName: planned.value.toolName,
      configHome: planned.value.configHome,
      dryRun: options.dryRun === true,
      appliedTargets: [],
      verifiedTargets: [],
      skippedTargets: [],
      failedTargets: [],
      targetChecks: planned.value.targets,
      changes: planned.value.changes,
    };
    const applied: string[] = [];
    const verified: string[] = [];
    const skipped: string[] = [];
    const failed: { target: string; label: string; error: string }[] = [];
    const contextHome = planned.value.configHome;

    for (const change of planned.value.changes) {
      if (change.problems.length > 0) {
        failed.push({
          target: change.target,
          label: change.label,
          error: change.problems.join("; "),
        });
      } else if (change.alreadyConfigured) {
        skipped.push(change.target);
      } else if (options.dryRun === true) {
        // Dry run: the change was planned but nothing is written.
      } else {
        const adapter = this.adapters.find((item) => item.target === change.target);
        if (adapter === undefined) continue;
        const result = await applyConfigurationChange(
          adapter,
          {
            toolName: request.toolName,
            toolVersion: request.toolVersion ?? null,
            mcp: request.mcp === true,
            configHome: contextHome,
            timestamp: this.now().toISOString(),
          },
          change,
          this.writer,
          this.now().toISOString(),
        );
        if (!result.ok) {
          failed.push({ target: change.target, label: change.label, error: result.error.message });
          continue;
        }
        applied.push(change.target);
        if (result.value.change.verified?.ok === true) verified.push(change.target);
      }
    }
    return ok({
      ...outcome,
      appliedTargets: applied,
      verifiedTargets: verified,
      skippedTargets: skipped,
      failedTargets: failed,
    });
  }

  public async unconfigure(
    toolName: string,
    options: { readonly configHome?: string } = {},
  ): Promise<Result<readonly string[]>> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(toolName)) {
      return fail(new ConfiguratorRequestError("toolName must be a safe tool name, not a path"));
    }
    const configHome = options.configHome ?? this.configHome;
    const cleaned: string[] = [];
    for (const adapter of this.adapters) {
      const ctx: ConfigurationContext = {
        toolName,
        toolVersion: null,
        mcp: false,
        configHome,
        timestamp: this.now().toISOString(),
      };
      const filePath = adapter.configPath(ctx);
      const existing = await this.writer.read(filePath);
      if (!existing.ok) continue;
      if (existing.value === null) continue;
      const parsed = parseConfigDocument(existing.value, adapter.format);
      if (!parsed.ok) continue;
      const document = parsed.value;
      if (!isConfigObject(document)) continue;
      const rootKey = adapter.rootKey(ctx);
      let changed = false;
      if (rootKey === null) {
        if (toolName in document) {
          const { [toolName]: _, ...rest } = document;
          Object.assign(document, rest);
          changed = true;
        }
      } else {
        const section = document[rootKey];
        if (isConfigObject(section) && toolName in section) {
          const { [toolName]: _, ...rest } = section as Record<string, unknown>;
          (document as Record<string, unknown>)[rootKey] = rest;
          changed = true;
        }
      }
      if (changed) {
        const writeResult = await this.writer.write(filePath, JSON.stringify(document, null, 2));
        if (writeResult.ok) cleaned.push(filePath);
      }
    }
    return ok(cleaned);
  }
}

function validateRequest(
  request: ConfiguratorRequest,
  targets: readonly ConfigurationTarget[],
): Result<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(request.toolName)) {
    return fail(new ConfiguratorRequestError("toolName must be a safe tool name, not a path"));
  }
  if (request.supportedAgents?.some((agent) => agent.trim().length === 0)) {
    return fail(new ConfiguratorRequestError("supportedAgents cannot contain empty agent ids"));
  }
  if (request.targets?.some((target) => !targets.includes(target))) {
    return fail(
      new ConfiguratorRequestError("request contains an unsupported configuration target"),
    );
  }
  if (request.configHome !== undefined && !isAbsolute(request.configHome)) {
    return fail(
      new ConfiguratorRequestError("configHome must be an absolute user-config directory"),
    );
  }
  return ok(undefined);
}

function isSupported(request: ConfiguratorRequest, adapter: ConfigurationAdapter): boolean {
  if (adapter.target === "mcp") return request.mcp === true;
  if (adapter.target === "vscode") return request.vscode === true;
  return request.supportedAgents?.includes(adapter.requiresAgent ?? "") === true;
}

function detailFor(
  adapter: ConfigurationAdapter,
  supported: boolean,
  info: AgentInfo | undefined,
): string {
  if (!supported) return "tool does not declare support for this target";
  if (adapter.requiresAgent === null) return "host target is available";
  if (info?.available === true)
    return info.version === undefined ? "agent detected" : `agent detected (${info.version})`;
  return "agent is not installed or could not be detected";
}
