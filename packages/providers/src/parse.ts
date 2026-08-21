import type { TokenUsage, ToolCall } from "@atlas/core";

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

/** Extract the assistant text from an OpenAI-compatible chat response. */
export function chatCompletionContent(root: Record<string, unknown> | null): string {
  const choicesValue = root?.["choices"];
  const choices = Array.isArray(choicesValue) ? choicesValue : [];
  const first = asObject(choices[0]);
  const message = asObject(first?.["message"]);
  const content = message?.["content"];
  return typeof content === "string" ? content : "";
}

/** Extract token usage from an OpenAI-compatible chat response. */
export function chatCompletionUsage(root: Record<string, unknown> | null): TokenUsage | null {
  const usage = asObject(root?.["usage"]);
  return usageFrom(getNumber(usage, "prompt_tokens"), getNumber(usage, "completion_tokens"));
}

/** Extract tool calls from an OpenAI-compatible chat response. */
export function chatCompletionToolCalls(root: Record<string, unknown> | null): readonly ToolCall[] {
  const choicesValue = root?.["choices"];
  const choices = Array.isArray(choicesValue) ? choicesValue : [];
  const first = asObject(choices[0]);
  const message = asObject(first?.["message"]);
  const toolCalls = message?.["tool_calls"];
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  return toolCalls
    .map((tc) => asObject(tc))
    .filter((tc): tc is Record<string, unknown> => tc !== null)
    .map((tc) => {
      const id = getString(tc, "id") ?? "";
      const type = getString(tc, "type");
      const fn = asObject(tc["function"]);
      const name = getString(fn, "name") ?? "";
      const arguments_ = getString(fn, "arguments") ?? "{}";
      if (type === "function" && id && name) {
        return { id, type: "function" as const, function: { name, arguments: arguments_ } };
      }
      return null;
    })
    .filter((tc): tc is ToolCall => tc !== null);
}
