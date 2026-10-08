/**
 * Typed errors for the Context → Agent integration layer.
 */

/** Base class for every context-integration error. */
export class ContextPackageError extends Error {
  public override readonly name: string = "ContextPackageError";
}

/**
 * Thrown (as a `Result` failure) when context cannot be attached to an existing
 * session. The current AI CLI adapters run in non-interactive mode, so context
 * can only be injected when a session *starts*; attaching to a live/terminal
 * session is not feasible.
 */
export class ContextAttachUnsupportedError extends ContextPackageError {
  public override readonly name: string = "ContextAttachUnsupportedError";
  public constructor(
    public readonly sessionId: string,
    public readonly status: string,
  ) {
    super(
      `Cannot attach context to session ${sessionId} (status: ${status}). The installed AI CLIs run in non-interactive mode, so context can only be supplied when the session starts.`,
    );
  }
}

/** Base class for every context-slice (persistence/serialization) error. */
export class ContextSliceError extends ContextPackageError {
  public override readonly name: string = "ContextSliceError";
}

/** A saved slice file could not be read as a valid context slice. */
export class ContextSliceValidationError extends ContextSliceError {
  public override readonly name: string = "ContextSliceValidationError";
}

/** Base class for task-ledger (persistence / handoff) errors. */
export class TaskLedgerError extends ContextPackageError {
  public override readonly name: string = "TaskLedgerError";
}

/** A saved task ledger could not be read as a valid document. */
export class TaskLedgerValidationError extends TaskLedgerError {
  public override readonly name: string = "TaskLedgerValidationError";
}

/** No task ledger exists for the requested id (or session id). */
export class TaskLedgerNotFoundError extends TaskLedgerError {
  public override readonly name: string = "TaskLedgerNotFoundError";
  public constructor(public readonly id: string) {
    super(`No task ledger found for "${id}".`);
  }
}
