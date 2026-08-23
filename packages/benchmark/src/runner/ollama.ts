import type {
  BenchmarkMode,
  BenchmarkRunner,
  ChatAgentPort,
  RunnerRequest,
  RunnerResult,
  TokenMetrics,
  ToolCallRecord,
} from "@atlas/core";
import { type Result, ok } from "@atlas/shared";

/**
 * Agents the Ollama runner can use: a single agent for every mode, or one per
 * mode so baseline runs get a plain chat agent (no tools offered) while
 * CodeAtlas runs get the tool-loop agent.
 */
export type OllamaRunnerAgents =
  | ChatAgentPort
  | {
      readonly baseline: ChatAgentPort;
      readonly codeatlas: ChatAgentPort;
    };

/**
 * Runner that executes tasks via Ollama's ChatAgentPort (direct provider call).
 *
 * Uses the tool-loop agent for CodeAtlas mode and a plain chat agent for
 * baseline mode when constructed with a per-mode agent map. No child process —
 * runs in-process against the provider port.
 */
export class OllamaRunner implements BenchmarkRunner {
  public readonly name = "ollama" as const;

  private readonly agents: OllamaRunnerAgents;

  public constructor(agents: OllamaRunnerAgents) {
    this.agents = agents;
  }

  public async execute(request: RunnerRequest): Promise<Result<RunnerResult>> {
    const start = performance.now();

    const result = await withTimeout(
      this.agentFor(request.mode).run({
        provider: "ollama",
        prompt: request.prompt,
        repositoryPath: request.repositoryPath,
      }),
      request.timeoutMs,
    );

    const wallMs = Math.round(performance.now() - start);

    if (result.timedOut) {
      return ok({
        metrics: emptyMetrics(),
        cost: 0,
        durationMs: wallMs,
        timedOut: true,
        exitCode: null,
        finalText: "",
        toolCalls: [],
        error: `timed out after ${request.timeoutMs}ms`,
      });
    }

    if (!result.value.ok) {
      return ok({
        metrics: emptyMetrics(),
        cost: 0,
        durationMs: wallMs,
        timedOut: false,
        exitCode: null,
        finalText: "",
        toolCalls: [],
        error: result.value.error.message,
      });
    }

    const cr = result.value.value;
    const messages = cr.messages ?? [];
    const denied = new Set(cr.deniedToolCalls ?? []);

    // Extract tool calls from assistant messages
    const toolCalls: ToolCallRecord[] = [];
    for (const msg of messages) {
      if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          toolCalls.push({
            name: tc.function.name,
            callId: tc.id,
            status: denied.has(tc.id) ? "error" : "success",
            isError: denied.has(tc.id),
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

  private agentFor(mode: BenchmarkMode): ChatAgentPort {
    if ("run" in this.agents) {
      return this.agents;
    }
    return mode === "baseline" ? this.agents.baseline : this.agents.codeatlas;
  }
}

/**
 * Race a promise against a timeout. A timed-out result is reported, but the
 * underlying agent call is not aborted — the provider port has no cancellation
 * seam, so the request may still complete in the background.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  // If the timeout wins the race, a later rejection of the agent call would be
  // unhandled — silence it (the timed-out result has already been reported).
  promise.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  try {
    const settled = await Promise.race([
      promise.then((value) => ({ timedOut: false as const, value })),
      timeout,
    ]);
    return settled;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
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
