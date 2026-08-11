/** Base class for session-manager failures; carries the affected session id. */
export abstract class SessionError extends Error {
  public readonly sessionId: string;

  protected constructor(message: string, sessionId: string) {
    super(message);
    this.name = "SessionError";
    this.sessionId = sessionId;
  }
}

/** The requested session id does not exist (or was pruned from memory). */
export class UnknownSessionError extends SessionError {
  public constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, sessionId);
    this.name = "UnknownSessionError";
  }
}

/** The repository path given to `createSession` is not a directory. */
export class InvalidRepositoryPathError extends Error {
  public readonly repositoryPath: string;

  public constructor(repositoryPath: string) {
    super(`Repository path is not a directory: ${repositoryPath}`);
    this.name = "InvalidRepositoryPathError";
    this.repositoryPath = repositoryPath;
  }
}

/**
 * A session is not in the state required by an operation (duplicate start,
 * already stopped, still starting, …). Never leaves a session stuck in a
 * transient state.
 */
export class SessionStateError extends SessionError {
  public constructor(sessionId: string, message: string) {
    super(message, sessionId);
    this.name = "SessionStateError";
  }
}
