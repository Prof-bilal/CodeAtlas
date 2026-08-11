import type { AgentRunRequest } from "@atlas/core";

/** The built-in agent provider ids (the "configured AI CLIs"). */
export type AgentName = "claude" | "gemini" | "codex" | "opencode";

/** Static configuration for one external AI CLI adapter. */
export interface AgentAdapterConfig {
  /** Lowercased provider id, e.g. `"claude"`. */
  readonly name: AgentName;
  /** Executable basename looked up on PATH, e.g. `"claude"`. */
  readonly binary: string;
  /** Arguments used to query the CLI version (default `["--version"]`). */
  readonly versionArgs?: readonly string[];
  /**
   * Leading flags that select a **non-interactive** run for this CLI.
   *
   * These follow each CLI's documented non-interactive mode (`claude -p`,
   * `gemini -p`, `codex exec`, `opencode run`) and are **best-effort
   * defaults** — they are overridable here and were not live-verified in this
   * repository. Provider-specific arguments live here, nowhere else.
   */
  readonly runMode?: readonly string[];
  /** Extra environment entries the CLI needs; never secrets. */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * A single external AI CLI, behind the provider-agnostic `AgentPort` contract.
 * Provider-specific binary, arguments, env, and version parsing are quarantined
 * inside adapters — no `if (provider === …)` switches anywhere else.
 */
export interface AgentAdapter {
  /** Lowercased provider id, e.g. `"claude"`. */
  readonly name: string;
  /** Executable basename looked up on PATH, e.g. `"claude"`. */
  readonly binary: string;
  /** Arguments used to query the CLI version. */
  readonly versionArgs: readonly string[];
  /** Extra environment entries the CLI needs; never secrets. */
  readonly env: Readonly<Record<string, string>>;
  /** Build the argument array (no shell string) for one non-interactive run. */
  buildArgs(request: AgentRunRequest): readonly string[];
  /** Extract a stable version string from `--version` output. */
  parseVersion(stdout: string): string | undefined;
}

/** Build an adapter from static configuration (one per external CLI). */
export function createAgentAdapter(config: AgentAdapterConfig): AgentAdapter {
  const runMode = config.runMode ?? [];
  return {
    name: config.name,
    binary: config.binary,
    versionArgs: config.versionArgs ?? ["--version"],
    env: config.env ?? {},
    buildArgs(request) {
      return [...runMode, request.prompt, ...(request.args ?? [])];
    },
    parseVersion(stdout) {
      const line = firstNonEmptyLine(stdout);
      if (line === undefined) {
        return undefined;
      }
      const match = line.match(/v?(\d+\.\d+(?:\.\d+)?)/);
      return match ? match[1] : line.trim();
    },
  };
}

function firstNonEmptyLine(output: string): string | undefined {
  for (const line of output.split(/\r?\n/)) {
    if (line.trim() !== "") {
      return line;
    }
  }
  return undefined;
}
