/** Base class for Tool Configurator (Task 23) errors. */
export class ConfiguratorError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfiguratorError";
  }
}

/**
 * The request itself is invalid or hostile — an unsafe tool name (one that
 * could escape a config directory), empty supported agents, or an unknown
 * target. Nothing is read or written.
 */
export class ConfiguratorRequestError extends ConfiguratorError {
  public constructor(message: string) {
    super(message);
    this.name = "ConfiguratorRequestError";
  }
}

/** A user-config file could not be read (I/O failure, not a missing file). */
export class ConfigReadError extends ConfiguratorError {
  public constructor(path: string, cause: unknown) {
    super(
      `Failed to read config at "${path}": ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "ConfigReadError";
  }
}

/**
 * Existing user config cannot be merged safely — the file is not valid JSON,
 * not a JSON object, or the config section the adapter manages is not an
 * object. Per `docs/AGENT_TOOLKIT.md` §9 the Configurator **refuses to
 * overwrite unrelated user configuration**, so the change is blocked instead
 * of clobbered.
 */
export class ConfigMergeError extends ConfiguratorError {
  public constructor(path: string, problems: readonly string[]) {
    super(
      `Cannot configure "${path}" without overwriting user config: ${problems.join("; ")}. No changes were made.`,
    );
    this.name = "ConfigMergeError";
    this.problems = problems;
  }

  /** Every merge problem found, as human-readable strings. */
  public readonly problems: readonly string[];
}

/** A user-config file could not be written or backed up (I/O failure). */
export class ConfigWriteError extends ConfiguratorError {
  public constructor(path: string, cause: unknown) {
    super(
      `Failed to write config at "${path}": ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "ConfigWriteError";
  }
}

/** Post-write read-back verification found the tool entry missing/mismatched. */
export class ConfigVerifyError extends ConfiguratorError {
  public constructor(path: string, detail: string) {
    super(`Verification failed for "${path}": ${detail}`);
    this.name = "ConfigVerifyError";
  }
}
