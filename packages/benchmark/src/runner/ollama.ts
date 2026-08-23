import type {
  BenchmarkRunner,
  ChatAgentPort,
  RunnerRequest,
  RunnerResult,
  TokenMetrics,
  ToolCallRecord,
} from "@atlas/core";
import { type Result, ok } from "@atlas/shared";

/**
 * Runner that executes tasks via Ollama's ChatAgentPort (direct provider call).
 *
 * Uses the ToolUsingChatAgent from Phase 3 when tools are provided (CodeAtlas mode),
 * or a plain ProviderChatAgent for baseline mode. No child process — runs in-process.
 */
export class OllamaRunner implements BenchmarkRunner {
  public readonly name = "ollama" as const;

  private readonly chatAgent: ChatAgentPort;

  public constructor(chatAgent: ChatAgentPort) {
    this.chatAgent = chatAgent;
  }

  public async execute(request: RunnerRequest): Promise<Result<RunnerResult>> {
    const start = performance.now();

    const result = await this.chatAgent.run({
      provider: "ollama",
      prompt: request.prompt,
      repositoryPath: request.repositoryPath,
    });

    const wallMs = Math.round(performance.now() - start);

    if (!result.ok) {
      return ok({
        metrics: emptyMetrics(),
        cost: 0,
        durationMs: wallMs,
        timedOut: false,
        exitCode: null,
        finalText: "",
        toolCalls: [],
        error: result.error.message,
      });
    }

    const cr = result.value;
    const messages = cr.messages ?? [];

    // Extract tool calls from assistant messages
    const toolCalls: ToolCallRecord[] = [];
    for (const msg of messages) {
      if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          toolCalls.push({
            name: tc.function.name,
            callId: tc.id,
            status: "success",
            isError: false,
          });
        }
      }
    }

    const tokenUsage = cr.tokenUsage;
    const metrics: TokenMetrics = {
      input: tokenUsage?.inputTokens ?? 0,
      output: tokenUsage?.outputTokens ?? 0,
      reasoning: 0,
      total: tokenUsage?.totalTokens ?? 0,
      cacheWrite: 0,
      cacheRead: 0,
      source: (tokenUsage?.totalTokens ?? 0) > 0 ? "actual" : "unknown",
    };

    return ok({
      metrics,
      cost: 0,
      durationMs: wallMs,
      timedOut: false,
      exitCode: null,
      finalText: cr.content ?? "",
      toolCalls,
    });
  }
}

function emptyMetrics(): TokenMetrics {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    total: 0,
    cacheWrite: 0,
    cacheRead: 0,
    source: "unknown",
  };
}
