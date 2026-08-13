import type { AgentInfo, AgentPort, AgentRunRequest, AgentRunResult } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import type { AgentAdapter } from "./adapter";
import { builtinAdapters } from "./adapters";
import { AgentCliNotFoundError, AgentConfigError, UnknownAgentError } from "./errors";
import { findExecutable } from "./executable";
import { ProcessRunner } from "./process";

/** How the service locates a CLI binary; injectable for offline tests. */
export type ExecutableResolver = (
  binary: string,
  options?: { pathEnv?: string; pathext?: string },
) => string | null;

/** Options for constructing an {@link AgentService}. */
export interface AgentServiceOptions {
  /** Provider adapters; defaults to the four built-ins. */
  readonly adapters?: readonly AgentAdapter[];
  /** Binary resolver; defaults to PATH scanning (`findExecutable`). */
  readonly resolveExecutable?: ExecutableResolver;
  /** Process supervisor; inject a fake for offline tests. */
  readonly processRunner?: ProcessRunner;
  /** Provider used when a request omits `provider`. Default `"claude"`. */
  readonly defaultProvider?: string;
}

/**
 * The AI CLI connection layer. Implements `AgentPort`: registers per-CLI
 * adapters, detects installed binaries (and versions), and runs non-interactive
 * invocations through a supervised child process.
 */
export class AgentService implements AgentPort {
  private readonly adapters = new Map<string, AgentAdapter>();
  private readonly resolveExecutable: ExecutableResolver;
  private readonly runner: ProcessRunner;
  public readonly defaultProvider: string;

  public constructor(options: AgentServiceOptions = {}) {
    this.defaultProvider = options.defaultProvider ?? "claude";
    this.resolveExecutable = options.resolveExecutable ?? findExecutable;
    this.runner = options.processRunner ?? new ProcessRunner();
    for (const adapter of options.adapters ?? builtinAdapters) {
      this.register(adapter);
    }
  }

  /** Register an adapter by name; new CLIs can be added this way. */
  public register(adapter: AgentAdapter): this {
    this.adapters.set(adapter.name, adapter);
    return this;
  }

  /** Whether an adapter is registered for the given provider id. */
  public hasAgent(provider: string): boolean {
    return this.adapters.has(provider);
  }

  /** The executable basename the provider spawns (e.g. `"claude"`), if any. */
  public binaryOf(provider: string): string | undefined {
    return this.adapters.get(provider)?.binary;
  }

  /**
   * Resolve a provider's executable to an absolute path on disk, or `null` when
   * its CLI is not installed. Provider-aware, but never spawns a process.
   */
  public resolveBinary(provider: string): Result<string | null> {
    const adapter = this.adapters.get(provider);
    if (adapter === undefined) {
      return fail(new UnknownAgentError(provider));
    }
    return ok(this.resolveExecutable(adapter.binary));
  }

  /** Build the provider-specific argument array for one invocation. */
  public buildArgsFor(
    provider: string,
    request: { prompt: string; args?: readonly string[]; interactive?: boolean },
  ): Result<readonly string[]> {
    const adapter = this.adapters.get(provider);
    if (adapter === undefined) {
      return fail(new UnknownAgentError(provider));
    }
    if (request.interactive === true) {
      // Interactive handoff: no run-mode flags and no prompt — the CLI opens
      // its own terminal UI and forwards only explicit extra args.
      const buildInteractive =
        adapter.buildInteractiveArgs ??
        ((input: { args?: readonly string[] }) => [...(input.args ?? [])]);
      return ok(
        buildInteractive({
          prompt: request.prompt,
          ...(request.args ? { args: request.args } : {}),
        }),
      );
    }
    return ok(adapter.buildArgs(request));
  }

  public listAgents(): readonly string[] {
    return [...this.adapters.keys()];
  }

  public async detectAgent(provider: string): Promise<Result<AgentInfo>> {
    const adapter = this.adapters.get(provider);
    if (adapter === undefined) {
      return fail(new UnknownAgentError(provider));
    }
    const path = this.resolveExecutable(adapter.binary);
    if (path === null) {
      return ok({ provider, binary: adapter.binary, available: false });
    }
    const version = await this.detectVersion(adapter, path);
    return ok({
      provider,
      binary: adapter.binary,
      available: true,
      path,
      ...(version === undefined ? {} : { version }),
    });
  }

  public async detectAll(): Promise<Result<readonly AgentInfo[]>> {
    const results: AgentInfo[] = [];
    for (const provider of this.adapters.keys()) {
      const info = await this.detectAgent(provider);
      if (info.ok) {
        results.push(info.value);
      }
    }
    return ok(results);
  }

  public async run(request: AgentRunRequest): Promise<Result<AgentRunResult>> {
    const provider = request.provider ?? this.defaultProvider;
    const adapter = this.adapters.get(provider);
    if (adapter === undefined) {
      return fail(new UnknownAgentError(provider));
    }
    const cwd = request.cwd ?? process.cwd();
    if (request.timeoutMs !== undefined && request.timeoutMs <= 0) {
      return fail(new AgentConfigError(`timeoutMs must be positive, got ${request.timeoutMs}`));
    }
    const path = this.resolveExecutable(adapter.binary);
    if (path === null) {
      return fail(new AgentCliNotFoundError(adapter.binary, provider));
    }

    const args = adapter.buildArgs(request);
    const outcome = await this.runner.run({
      command: path,
      args,
      cwd,
      ...(request.env !== undefined ? { env: request.env } : {}),
      ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
    });
    if (!outcome.ok) {
      return outcome;
    }
    const { exitCode, signal, timedOut, stdout, stderr, durationMs } = outcome.value;
    return ok({
      provider,
      command: path,
      args,
      prompt: request.prompt,
      cwd,
      exitCode,
      signal,
      timedOut,
      stdout,
      stderr,
      durationMs,
    });
  }

  private async detectVersion(adapter: AgentAdapter, path: string): Promise<string | undefined> {
    const outcome = await this.runner.run({
      command: path,
      args: adapter.versionArgs,
      timeoutMs: VERSION_TIMEOUT_MS,
    });
    if (!outcome.ok) {
      return undefined;
    }
    return adapter.parseVersion(outcome.value.stdout);
  }
}

const VERSION_TIMEOUT_MS = 10_000;
