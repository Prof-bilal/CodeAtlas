import type { InstallRollbackStatus } from "@atlas/core";

/** Base class for all Tool Installer (Task 22) errors. */
export class InstallerError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InstallerError";
  }
}

/**
 * The compatibility gate (Task 21) reported the tool as **not installable in
 * this environment**. The installer never fails open — an `incompatible` tool
 * is blocked before anything runs or is planned further.
 */
export class InstallNotCompatibleError extends InstallerError {
  /** The compatibility engine's one-line overall evidence. */
  public readonly overall: string;

  public constructor(overall: string) {
    super(`Tool is not installable in this environment (compatibility: ${overall}).`);
    this.name = "InstallNotCompatibleError";
    this.overall = overall;
  }
}

/**
 * The security gate (Task 24 status) marked the tool **blocked** (known bad /
 * broken provenance). A `blocked` tool cannot be installed through the Toolkit,
 * even with explicit user approval.
 */
export class InstallBlockedError extends InstallerError {
  public constructor(name: string) {
    super(`Tool "${name}" is marked blocked (security/trust) and cannot be installed.`);
    this.name = "InstallBlockedError";
  }
}

/**
 * The user did not grant explicit approval. Approval is mandatory unless an
 * explicit automation mode is in force — this error aborts **before anything
 * runs**.
 */
export class InstallApprovalDeniedError extends InstallerError {
  public constructor() {
    super("Installation aborted: user approval was not granted.");
    this.name = "InstallApprovalDeniedError";
  }
}

/**
 * The declared distribution mechanism has no adapter in this build (the MVP
 * ships a safe subset — `npm`, `pip`, `cargo`, `go`; `binary`,
 * `github-release`, and `mcp` are planned). Adding an ecosystem is a new small
 * adapter, not a fork.
 */
export class InstallUnsupportedMethodError extends InstallerError {
  public constructor(method: string) {
    super(
      `Install method "${method}" is not implemented in this build. Supported methods: npm, pip, cargo, go.`,
    );
    this.name = "InstallUnsupportedMethodError";
  }
}

/**
 * The request itself is invalid or hostile — an unsafe tool name, a missing
 * working directory, or an installation argument (package/module/version) that
 * could be interpreted as flags or contain control characters. Nothing is
 * executed.
 */
export class InstallInvalidRequestError extends InstallerError {
  public constructor(message: string) {
    super(message);
    this.name = "InstallInvalidRequestError";
  }
}

/** The install command could not be run at all (spawn/cwd failure). */
export class InstallProcessError extends InstallerError {
  public constructor(command: string, cause: unknown) {
    super(
      `Failed to run install command "${command}": ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "InstallProcessError";
  }
}

/**
 * The install command ran but failed (non-zero exit). The error carries the
 * honest rollback state and the bounded, redacted install log so caller can
 * report what happened and whether the previous state was restored.
 */
export class InstallFailedError extends InstallerError {
  /** Child exit code of the failed install command. */
  public readonly exitCode: number | null;
  /** Signal that terminated the child, if any. */
  public readonly signal: string | null;
  /** Whether rollback was attempted / succeeded. */
  public readonly rollback: InstallRollbackStatus;
  /** ISO-8601 timestamp of the attempted install. */
  public readonly recordedAt: string;
  /** Bounded log of the run (what ran, output summary, verdicts). */
  public readonly log: readonly string[];

  public constructor(input: {
    readonly toolName: string;
    readonly exitCode: number | null;
    readonly signal: string | null;
    readonly rollback: InstallRollbackStatus;
    readonly recordedAt: string;
    readonly log: readonly string[];
  }) {
    super(
      `Installation of "${input.toolName}" failed` +
        `${input.exitCode === null ? "" : ` (exit ${input.exitCode})`}` +
        `; rollback: ${input.rollback}.`,
    );
    this.name = "InstallFailedError";
    this.exitCode = input.exitCode;
    this.signal = input.signal;
    this.rollback = input.rollback;
    this.recordedAt = input.recordedAt;
    this.log = input.log;
  }
}
