/**
 * Typed errors for the metrics module.
 */

/** Base class for all metrics errors. */
export class MetricsError extends Error {
  public override readonly name: string = "MetricsError";
}

/** The metrics file contains invalid or unsupported data. */
export class MetricsValidationError extends MetricsError {
  public override readonly name: string = "MetricsValidationError";
}

/** The metrics file uses a newer schema version than this code supports. */
export class MetricsSchemaVersionError extends MetricsError {
  public override readonly name: string = "MetricsSchemaVersionError";
  constructor(
    readonly fileVersion: number,
    readonly supportedVersion: number,
  ) {
    super(
      `Metrics file uses schema version ${fileVersion}, but this version of CodeAtlas supports up to ${supportedVersion}. Please update CodeAtlas.`,
    );
  }
}

/** The metrics file could not be read or written. */
export class MetricsPersistenceError extends MetricsError {
  public override readonly name: string = "MetricsPersistenceError";
}
