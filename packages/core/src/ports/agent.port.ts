import type { Result } from "@atlas/shared";

/**
 * The "Agent Interface" contract for the Unified AI CLI Orchestrator (Direction B).
 *
 * A connection layer that detects installed AI coding CLIs (Claude Code,
 * Gemini, Codex, OpenCode, …) and runs non-interactive invocations of them as
 * child processes. It does **not** model sessions, prompt history, or
 * multiplexing — this port is the narrow spawn/detect boundary that higher
 * layers (session manager, router) build on.
 *
 * Consumers see only this interface; provider-specific binary names, arguments,
 * env, and exit-code interpretation live inside provider adapters.
 */
export interface AgentPort {
  /** The provider used when a request omits `provider`. */
  readonly defaultProvider: string;

  /** The ids of all registered provider adapters (e.g. `"claude"`). */
  listAgents(): readonly string[];

  /** Detect whether one provider's CLI is installed, and its version if so. */
  detectAgent(provider: string): Promise<Result<AgentInfo>>;

  /** Detect all registered providers at once. */
  detectAll(): Promise<Result<readonly AgentInfo[]>>;

  /**
   * Run one non-interactive invocation of an installed AI CLI.
   *
   * The external process is spawned with an **argument array** (no shell
   * string). Output is captured; a timeout kills the child and reports partial
   * output honestly.
   */
  run(request: AgentRunRequest): Promise<Result<AgentRunResult>>;
}

/** Runtime facts about one external AI CLI. */
export interface AgentInfo {
  /** Adapter id, e.g. `"claude"`. */
  readonly provider: string;
  /** Executable name the adapter spawns, e.g. `"claude"`. */
  readonly binary: string;
  /** Whether the binary was found on PATH. */
  readonly available: boolean;
  /** Resolved absolute path to the binary, when available. */
  readonly path?: string;
  /** Detected version string, when available. */
  readonly version?: string;
}

/** A single non-interactive invocation of an AI CLI. */
export interface AgentRunRequest {
  /** Adapter id, defaults to `AgentPort.defaultProvider`. */
  readonly provider?: string;
  /** The prompt / task text to forward as an argument. */
  readonly prompt: string;
  /** Extra args appended after the prompt (provider-specific). */
  readonly args?: readonly string[];
  /** Working directory; defaults to `process.cwd()`. */
  readonly cwd?: string;
  /** Extra environment entries for the child (`PATH` etc.); never logged. */
  readonly env?: Readonly<Record<string, string>>;
  /** Kill the child after this many milliseconds (default from the adapter). */
  readonly timeoutMs?: number;
}

/** The completion of one AI CLI invocation. */
export interface AgentRunResult {
  /** Adapter id that ran (e.g. `"claude"`). */
  readonly provider: string;
  /** Resolved binary path actually spawned. */
  readonly command: string;
  /** The exact argument array passed to the process (no shell). */
  readonly args: readonly string[];
  readonly prompt: string;
  /** Working directory the child was launched in. */
  readonly cwd: string;
  /** Child exit code; `null` when killed by a signal. */
  readonly exitCode: number | null;
  /** Signal that terminated the child, if any. */
  readonly signal: string | null;
  /** True when the child was killed because of a timeout. */
  readonly timedOut: boolean;
  /** Captured stdout (partial when timed out). */
  readonly stdout: string;
  /** Captured stderr (partial when timed out). */
  readonly stderr: string;
  /** Wall-clock duration of the invocation, in milliseconds. */
  readonly durationMs: number;
}
