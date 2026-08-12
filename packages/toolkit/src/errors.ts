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

// ── Tool Manifest errors ─────────────────────────────────────────────────────

/** Base class for tool-manifest-module errors. */
export class ManifestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

/**
 * The manifest declares a different schema version than this build supports.
 * Schema-versioned data is never silently migrated — the load fails loudly.
 */
export class ManifestSchemaVersionError extends ManifestError {
  public readonly expected: number;
  public readonly got: unknown;

  public constructor(expected: number, got: unknown) {
    super(`Tool manifest schema version mismatch: expected ${expected}, got ${got}.`);
    this.name = "ManifestSchemaVersionError";
    this.expected = expected;
    this.got = got;
  }
}

/**
 * The manifest failed schema validation. Every problem is listed — a malformed
 * or hostile manifest fails loudly instead of being silently repaired or
 * partially accepted.
 */
export class ManifestValidationError extends ManifestError {
  /** Tool name (or `"<manifest>"` for a whole-payload failure). */
  public readonly record: string;
  /** Every validation problem found, as human-readable strings. */
  public readonly problems: readonly string[];

  public constructor(record: string, problems: readonly string[]) {
    super(`Invalid tool manifest "${record}": ${problems.join("; ")}`);
    this.name = "ManifestValidationError";
    this.record = record;
    this.problems = problems;
  }
}

/** A manifest file could not be read (missing is not an error; unreadable is). */
export class ManifestLoadError extends ManifestError {
  public constructor(path: string, cause: unknown) {
    super(
      `Failed to load tool manifest at "${path}": ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "ManifestLoadError";
  }
}

// ── Compatibility Engine errors ──────────────────────────────────────────────

/** Base class for compatibility-engine errors. */
export class CompatibilityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CompatibilityError";
  }
}
