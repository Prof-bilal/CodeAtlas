/**
 * Request argument validation for MCP tools.
 *
 * The MCP SDK already rejects arguments that fail each tool's declared zod
 * input schema (surfaced as a JSON-RPC `InvalidParams` error). This layer is a
 * second, defensive check that lives next to the handlers so they are also safe
 * to call directly from tests, and so cross-field rules (e.g. "query must be
 * non-empty") get readable messages.
 */

/** Raised for invalid or missing tool arguments. */
export class ToolInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

/** Raised for expected, user-facing domain failures (no index, nothing stored). */
export class ToolDomainError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ToolDomainError";
  }
}

/** The raw, untyped arguments a tool handler receives. */
export type ToolArgs = Readonly<Record<string, unknown>>;

/** Require a non-empty string argument. */
export function requireString(args: ToolArgs, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolInputError(`"${key}" is required and must be a non-empty string.`);
  }
  return value;
}

/** Read an optional string argument (rejects non-strings). */
export function optionalString(args: ToolArgs, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ToolInputError(`"${key}" must be a string.`);
  }
  return value;
}

/** Require an integer argument within `[min, max]`. */
export function requireInt(
  args: ToolArgs,
  key: string,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ToolInputError(`"${key}" must be an integer between ${min} and ${max}.`);
  }
  return value;
}

/** Read an optional integer argument within `[min, max]`. */
export function optionalInt(
  args: ToolArgs,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ToolInputError(`"${key}" must be an integer between ${min} and ${max}.`);
  }
  return value;
}

/** Read an optional finite number argument with a lower bound. */
export function optionalNumber(args: ToolArgs, key: string, min: number): number | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    throw new ToolInputError(`"${key}" must be a number greater than or equal to ${min}.`);
  }
  return value;
}

/** Read an optional boolean argument. */
export function optionalBoolean(args: ToolArgs, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ToolInputError(`"${key}" must be a boolean.`);
  }
  return value;
}

/** Read an optional environment value that must be one of `values`. */
export function optionalEnumFromEnv(envKey: string, values: readonly string[]): string | undefined {
  const value = process.env[envKey];
  if (value === undefined || value === "") {
    return undefined;
  }
  if (!values.includes(value)) {
    throw new ToolInputError(`Environment "${envKey}" must be one of: ${values.join(", ")}.`);
  }
  return value;
}

/** Read an optional string that must be one of `values`. */
export function optionalEnum(
  args: ToolArgs,
  key: string,
  values: readonly string[],
): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !values.includes(value)) {
    throw new ToolInputError(`"${key}" must be one of: ${values.join(", ")}.`);
  }
  return value;
}
