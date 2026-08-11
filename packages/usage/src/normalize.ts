import type { MeasuredQuantity, TokenUsageRecord, UsageEventInput, UsageRecord } from "@atlas/core";

/** Produce a normalized `UsageRecord` (minus `cost`) from a raw event. */
export function normalizeEvent(event: UsageEventInput, id: string): Omit<UsageRecord, "cost"> {
  const occurredAt = event.occurredAt ?? new Date().toISOString();
  if (event.source === "provider") {
    const input = finiteNumber(event.inputTokens);
    const output = finiteNumber(event.outputTokens);
    const total = finiteNumber(event.totalTokens);
    const reported = input !== null || output !== null || total !== null;
    return {
      id,
      source: "provider",
      agent: event.agent ?? event.provider,
      provider: event.provider,
      model: event.model,
      sessionId: event.sessionId ?? null,
      taskId: event.taskId ?? null,
      taskRef: event.taskRef ?? null,
      occurredAt,
      requestCount: event.requestCount ?? 1,
      latencyMs: event.latencyMs,
      exitCode: null,
      timedOut: false,
      tokens: providerTokens(input, output, total, reported),
    };
  }
  return {
    id,
    source: "session",
    agent: event.agent ?? event.provider,
    provider: event.provider,
    model: null,
    sessionId: event.sessionId ?? null,
    taskId: event.taskId ?? null,
    taskRef: event.taskRef ?? null,
    occurredAt,
    requestCount: event.requestCount,
    latencyMs: event.latencyMs ?? null,
    exitCode: event.exitCode ?? null,
    timedOut: event.timedOut ?? false,
    tokens: {
      input: unknownQuantity("agent sessions do not report token counts"),
      output: unknownQuantity("agent sessions do not report token counts"),
      total: unknownQuantity("agent sessions do not report token counts"),
    },
  };
}

/**
 * Provider token quantities with the tri-state model:
 * - a finite reported value → `actual` (the provider measured it);
 * - absent everywhere → every field `unknown` (never guessed);
 * - a missing total is derived by `input + output` when both are known
 *   (exact arithmetic on reported values, so still `actual`).
 */
function providerTokens(
  input: number | null,
  output: number | null,
  total: number | null,
  reported: boolean,
): TokenUsageRecord {
  if (!reported) {
    const missing = unknownQuantity("provider reported no token usage");
    return { input: missing, output: missing, total: missing };
  }
  const derivedTotal =
    total ?? (input !== null && output !== null ? input + output : null);
  return {
    input: input === null ? unknownQuantity("provider did not report input tokens") : actual(input),
    output:
      output === null ? unknownQuantity("provider did not report output tokens") : actual(output),
    total:
      derivedTotal === null
        ? unknownQuantity("provider did not report a total")
        : actual(derivedTotal),
  };
}

function finiteNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function actual(value: number): MeasuredQuantity {
  return { source: "actual", value };
}

function unknownQuantity(note: string): MeasuredQuantity {
  return { source: "unknown", value: null, note };
}
