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
      `Cannot attach context to session ${sessionId} (status: ${status}). ` +
        "The installed AI CLIs run in non-interactive mode, so context can only be " +
        "supplied when the session starts.",
    );
  }
}
