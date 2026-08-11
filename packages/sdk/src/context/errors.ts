/**
 * Consistent, typed errors for the CodeAtlas Context SDK.
 *
 * Consumers (CLI, MCP, editors, agents) catch these instead of raw database or
 * driver errors. Every class keeps a stable `name` so the SDK guarantees it
 * never leaks SQLite internals to callers.
 */

/** Base class for every Context SDK error. */
export class ContextError extends Error {
  public override readonly name: string = "ContextError";
}

/** The context database itself does not exist or is not available. */
export class ContextUnavailableError extends ContextError {
  public override readonly name: string = "ContextUnavailableError";
}

/** A requested entity (file / symbol / project) was not found in the index. */
export class ContextNotFoundError extends ContextError {
  public override readonly name: string = "ContextNotFoundError";
}

/** A specific file was not found in the index. */
export class FileNotFoundError extends ContextNotFoundError {
  public override readonly name: string = "FileNotFoundError";
  public constructor(public readonly path: string) {
    super(`File not found in the index: ${path}`);
  }
}

/** A specific symbol was not found in the index. */
export class SymbolNotFoundError extends ContextNotFoundError {
  public override readonly name: string = "SymbolNotFoundError";
  public constructor(public readonly symbolId: string) {
    super(`Symbol not found in the index: ${symbolId}`);
  }
}

/** A dependency target could not be resolved to a graph node. */
export class DependencyNotFoundError extends ContextNotFoundError {
  public override readonly name: string = "DependencyNotFoundError";
  public constructor(public readonly target: string) {
    super(`Dependency target not found in the index: ${target}`);
  }
}

/** The underlying database raised an error; the cause is preserved. */
export class DatabaseError extends ContextError {
  public override readonly name: string = "DatabaseError";
  public constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/** A search/query parameter was invalid (e.g. an empty query). */
export class InvalidQueryError extends ContextError {
  public override readonly name: string = "InvalidQueryError";
  public constructor(message = "The provided query is invalid.") {
    super(message);
  }
}
