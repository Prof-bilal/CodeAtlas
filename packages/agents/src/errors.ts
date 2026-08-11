/** Thrown (as a `Result` failure) when no adapter is registered for an agent. */
export class UnknownAgentError extends Error {
  public readonly agent: string;

  public constructor(agent: string) {
    super(`No agent adapter is registered for "${agent}".`);
    this.name = "UnknownAgentError";
    this.agent = agent;
  }
}

/**
 * Thrown when an agent CLI binary cannot be resolved on PATH. The process itself
 * was never started — this is a detection failure, not a runtime failure.
 */
export class AgentCliNotFoundError extends Error {
  public readonly binary: string;
  public readonly provider: string | undefined;

  public constructor(binary: string, provider?: string) {
    const who = provider === undefined ? `"${binary}"` : `"${binary}" (${provider})`;
    super(
      `AI CLI ${who} could not be found on PATH. Install it, or check your configuration (atlas doctor can help).`,
    );
    this.name = "AgentCliNotFoundError";
    this.binary = binary;
    this.provider = provider;
  }
}

/** Thrown when a run request is misconfigured (bad cwd, bad timeout, …). */
export class AgentConfigError extends Error {
  public readonly reason: string;

  public constructor(reason: string) {
    super(`Invalid agent run configuration: ${reason}`);
    this.name = "AgentConfigError";
    this.reason = reason;
  }
}

/** Thrown when spawning or supervising the external process fails. */
export class AgentRunError extends Error {
  public readonly provider: string | undefined;
  override readonly cause: unknown;

  public constructor(message: string, options?: { provider?: string; cause?: unknown }) {
    super(message);
    this.name = "AgentRunError";
    this.provider = options?.provider;
    this.cause = options?.cause;
  }
}

/**
 * Thrown (by the process runner) when the child process could not be spawned —
 * most commonly the resolved binary was removed between detection and spawn
 * (`ENOENT`), or the working directory is not executable.
 */
export class ProcessSpawnError extends Error {
  public readonly command: string;
  override readonly cause: unknown;

  public constructor(command: string, cause?: unknown) {
    super(`Failed to start external process "${command}".`, { cause });
    this.name = "ProcessSpawnError";
    this.command = command;
    this.cause = cause;
  }
}

/** Thrown (by the process runner) when the requested working directory is invalid. */
export class InvalidWorkingDirectoryError extends Error {
  public readonly cwd: string;

  public constructor(cwd: string) {
    super(`Working directory does not exist or is not a directory: ${cwd}`);
    this.name = "InvalidWorkingDirectoryError";
    this.cwd = cwd;
  }
}
