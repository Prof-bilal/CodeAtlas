import type { TokenUsage } from "@atlas/core";

/** True for 2xx HTTP status codes. */
export function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/** Coerce a value into a plain object, or `null`. */
export function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Read a string field from an object, or `undefined`. */
export function getString(obj: Record<string, unknown> | null, key: string): string | undefined {
  const value = obj?.[key];
  return typeof value === "string" ? value : undefined;
}

/** Read a finite number field from an object, or `undefined`. */
export function getNumber(obj: Record<string, unknown> | null, key: string): number | undefined {
  const value = obj?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Build a `TokenUsage` from possibly-absent input/output token counts. */
export function usageFrom(
  input: number | undefined,
  output: number | undefined,
): TokenUsage | null {
  if (input === undefined && output === undefined) {
    return null;
  }
  const inputTokens = input ?? 0;
  const outputTokens = output ?? 0;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

/** Spread helper so the `usage` field is only present when available. */
export function withUsage(usage: TokenUsage | null): { usage?: TokenUsage } {
  return usage === null ? {} : { usage };
}
