import type {
  BenchmarkCallUsage,
  BenchmarkMetricValue,
  BenchmarkObservability,
  ChatAgentExecutionTrace,
  TokenMetrics,
  ToolCallRecord,
} from "@atlas/core";

function measured(value: number, note?: string): BenchmarkMetricValue {
  return { value, status: "measured", ...(note !== undefined ? { note } : {}) };
}

function unavailable(note: string): BenchmarkMetricValue {
  return { value: null, status: "unavailable", note };
}

function notInstrumented(note: string): BenchmarkMetricValue {
  return { value: null, status: "not_instrumented", note };
}

function labelForSource(
  source: NonNullable<ChatAgentExecutionTrace["messages"]>[number]["source"],
): { readonly label: string; readonly classification: "A" | "B" | "C" | "D" } {
  switch (source) {
    case "user-prompt":
      return { label: "user-prompt", classification: "B" };
    case "context-guidance":
      return { label: "context-guidance", classification: "B" };
    case "state-summary":
      return { label: "state-summary", classification: "B" };
    case "assistant-tool-call":
      return { label: "assistant-tool-call", classification: "B" };
    case "tool-result":
      return { label: "tool-result", classification: "C" };
    case "recovery-note":
      return { label: "recovery-note", classification: "C" };
    case "progress-note":
      return { label: "progress-note", classification: "C" };
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function sum(xs: readonly number[]): number {
  return xs.reduce((total, value) => total + value, 0);
}

function groupToolCalls(toolCalls: readonly ToolCallRecord[]): {
  readonly counts: Record<string, number>;
  readonly outputTokens: Record<string, number>;
  readonly repeatedFileCount: number;
} {
  const counts: Record<string, number> = {};
  const outputTokens: Record<string, number> = {};
  const seenToolOutputs = new Set<string>();
  let repeatedFileCount = 0;

  for (const call of toolCalls) {
    counts[call.name] = (counts[call.name] ?? 0) + 1;
    outputTokens[call.name] = (outputTokens[call.name] ?? 0) + (call.outputTokens ?? 0);
    if (call.output !== undefined && seenToolOutputs.has(`${call.name}:${call.output}`)) {
      repeatedFileCount += 1;
    }
    if (call.output !== undefined) {
      seenToolOutputs.add(`${call.name}:${call.output}`);
    }
  }

  return { counts, outputTokens, repeatedFileCount };
}

export function buildObservability(params: {
  readonly mode: "baseline" | "codeatlas" | "codeatlas-intel";
  readonly metrics: TokenMetrics;
  readonly durationMs: number;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly executionTrace?: ChatAgentExecutionTrace;
}): BenchmarkObservability {
  const { counts, outputTokens, repeatedFileCount } = groupToolCalls(params.toolCalls);
  const trace = params.executionTrace;
  const providerCalls: BenchmarkCallUsage[] | undefined = trace?.calls.map((call) => ({
    callIndex: call.callIndex,
    round: call.round,
    messageCount: call.messageCount,
    estimatedInputTokens: call.estimatedInputTokens,
    toolSchemaTokens: call.toolSchemaTokens,
    ...(call.reportedInputTokens !== undefined ? { inputTokens: call.reportedInputTokens } : {}),
    ...(call.reportedOutputTokens !== undefined ? { outputTokens: call.reportedOutputTokens } : {}),
    ...(call.reportedTotalTokens !== undefined ? { totalTokens: call.reportedTotalTokens } : {}),
  }));

  const llmCallCount = providerCalls?.length ?? 0;
  const duplicateBucketsMap = new Map<
    string,
    { source: string; classification: "A" | "B" | "C" | "D"; tokens: number; count: number }
  >();
  let repeatedContextTokens = 0;
  let duplicateToolResultTokens = 0;
  let guidanceTokens = 0;
  let transcriptEstimatedTokens = 0;

  for (const message of trace?.messages ?? []) {
    transcriptEstimatedTokens += message.estimatedTokens;
    const duplicateCopies = Math.max(0, llmCallCount - message.firstCallIndex);
    if (message.source === "context-guidance") {
      guidanceTokens += message.estimatedTokens;
    }
    if (duplicateCopies <= 0) {
      continue;
    }
    const duplicatedTokens = message.estimatedTokens * duplicateCopies;
    repeatedContextTokens += duplicatedTokens;
    if (message.source === "tool-result") {
      duplicateToolResultTokens += duplicatedTokens;
    }
    const { label, classification } = labelForSource(message.source);
    const key = `${classification}:${label}`;
    const current = duplicateBucketsMap.get(key);
    duplicateBucketsMap.set(key, {
      source: label,
      classification,
      tokens: (current?.tokens ?? 0) + duplicatedTokens,
      count: (current?.count ?? 0) + duplicateCopies,
    });
  }

  const repeatedToolSchemaTokens =
    providerCalls !== undefined && providerCalls.length > 1
      ? sum(providerCalls.slice(1).map((call) => call.toolSchemaTokens))
      : 0;
  if (repeatedToolSchemaTokens > 0) {
    duplicateBucketsMap.set("B:tool-schema", {
      source: "tool-schema",
      classification: "B",
      tokens: repeatedToolSchemaTokens,
      count: Math.max(0, (providerCalls?.length ?? 1) - 1),
    });
    repeatedContextTokens += repeatedToolSchemaTokens;
  }

  const totalToolOutputTokens = sum(Object.values(outputTokens));
  const finalCall = providerCalls?.[providerCalls.length - 1];
  const totalInput =
    providerCalls !== undefined && providerCalls.length > 0
      ? sum(providerCalls.map((call) => call.inputTokens ?? 0))
      : params.metrics.input;

  return {
    metrics: {
      total_tokens: measured(params.metrics.total),
      system_prompt_tokens:
        params.mode === "baseline"
          ? measured(0, "No top-level system prompt is sent in the benchmark path.")
          : measured(guidanceTokens, "Context guidance is injected into the first user turn."),
      repository_context_tokens: measured(
        0,
        "No repository context is pre-injected; repository content arrives only through tool outputs.",
      ),
      tool_output_tokens: measured(totalToolOutputTokens),
      repeated_context_tokens: measured(repeatedContextTokens),
      duplicate_context_percent: measured(
        totalInput > 0 ? (repeatedContextTokens / totalInput) * 100 : 0,
      ),
      unique_context_tokens: measured(
        Math.max(0, totalToolOutputTokens - duplicateToolResultTokens),
      ),
      agent_message_tokens: unavailable(
        "Single-agent benchmark path; no inter-agent handoffs exist.",
      ),
      reasoning_tokens:
        params.metrics.reasoning > 0
          ? measured(params.metrics.reasoning)
          : unavailable("Provider did not report reasoning tokens for this run."),
      final_answer_input_tokens:
        finalCall?.inputTokens !== undefined
          ? measured(finalCall.inputTokens)
          : notInstrumented("packages/benchmark/src/runner/ollama.ts"),
      final_answer_output_tokens:
        finalCall?.outputTokens !== undefined
          ? measured(finalCall.outputTokens)
          : notInstrumented("packages/benchmark/src/runner/ollama.ts"),
      llm_call_count:
        llmCallCount > 0
          ? measured(llmCallCount)
          : notInstrumented("packages/benchmark/src/runner/opencode.ts"),
      tool_call_count: measured(params.toolCalls.length),
      latency_ms: measured(params.durationMs),
      cache_read_tokens:
        params.metrics.source === "actual"
          ? measured(params.metrics.cacheRead)
          : unavailable("Provider did not report cache-read tokens."),
      cache_write_tokens:
        params.metrics.source === "actual"
          ? measured(params.metrics.cacheWrite)
          : unavailable("Provider did not report cache-write tokens."),
    },
    ...(providerCalls !== undefined ? { providerCalls } : {}),
    toolCallsByTool: counts,
    toolOutputTokensByTool: outputTokens,
    duplicateBuckets: [...duplicateBucketsMap.values()],
    ...(trace !== undefined ? { transcriptMessageCount: trace.messages.length } : {}),
    ...(trace !== undefined ? { transcriptEstimatedTokens } : {}),
    repeatedFileCount,
  };
}
