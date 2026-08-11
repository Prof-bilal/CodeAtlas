/** Base class for toolkit/registry-module errors. */
export class RegistryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

/**
 * The catalog/overlay declares a different registry schema version than this
 * build supports. Schema-versioned data is never silently migrated — the load
 * fails loudly.
 */
export class RegistrySchemaVersionError extends RegistryError {
  public readonly expected: number;
  public readonly got: unknown;

  public constructor(expected: number, got: unknown) {
    super(`Registry schema version mismatch: expected ${expected}, got ${got}.`);
    this.name = "RegistrySchemaVersionError";
    this.expected = expected;
    this.got = got;
  }
}

/**
 * One or more records failed schema validation. Every problem is listed —
 * malformed records fail loudly instead of being skipped silently.
 */
export class RegistryValidationError extends RegistryError {
  /** Name of the offending record (or `"<catalog>"` for a collection). */
  public readonly record: string;
  /** Every validation problem found, as human-readable strings. */
  public readonly problems: readonly string[];

  public constructor(record: string, problems: readonly string[]) {
    super(`Invalid registry record "${record}": ${problems.join("; ")}`);
    this.name = "RegistryValidationError";
    this.record = record;
    this.problems = problems;
  }
}

/** The overlay file could not be read or parsed. */
export class RegistryLoadError extends RegistryError {
  public constructor(path: string, cause: unknown) {
    super(
      `Failed to load registry overlay at "${path}": ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "RegistryLoadError";
  }
}
