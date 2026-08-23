import type {
  ChatAgentPort,
  ChatAgentRequest,
  ChatAgentResult,
  ProviderMessage,
  ProviderPort,
  ToolCall,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import type { ContextToolSource } from "./types";
import { MAX_TOOL_RESULT_CHARS, MAX_TOOL_ROUNDS } from "./types";

/**
 * A chat agent that wraps a `ProviderPort` and runs a bounded tool loop.
 *
 * When the model responds with `tool_calls`, this agent executes them against
 * the injected `ContextToolSource`, feeds the results back as `role: "tool"`
 * messages, and re-calls the provider. The loop terminates when:
 * - The model responds without tool calls (final answer).
 * - `MAX_TOOL_ROUNDS` is reached (returns the last content with a note).
 * - An unknown tool is called (returns an error result to the model).
 */
export class ToolUsingChatAgent implements ChatAgentPort {
  public readonly providers: readonly string[];
  private readonly provider: ProviderPort;
  private readonly toolSource: ContextToolSource;
  private readonly maxRounds: number;

  public constructor(
    provider: ProviderPort,
    toolSource: ContextToolSource,
    providers: readonly string[] = ["ollama"],
    maxRounds: number = MAX_TOOL_ROUNDS,
  ) {
    this.providers = providers;
    this.provider = provider;
    this.toolSource = toolSource;
    this.maxRounds = maxRounds;
  }

  public handles(provider: string): boolean {
    return this.providers.some((p) => p === provider);
  }

  public async run(request: ChatAgentRequest): Promise<Result<ChatAgentResult>> {
    if (!this.handles(request.provider)) {
      return fail(new Error(`Provider "${request.provider}" is not handled by this runner`));
    }

    const tools = this.toolSource.listTools();
    const startMs = Date.now();
    const messages =
      request.messages !== undefined ? [...request.messages] : buildInitialMessages(request);
    const toolDefs = tools.length > 0 ? tools : undefined;

    let lastContent = "";
    let lastModel: string | undefined;
    let lastUsage: ChatAgentResult["tokenUsage"] = undefined;

    for (let round = 0; round < this.maxRounds; round++) {
      const result = await this.provider.complete({
        prompt: request.prompt,
        ...(toolDefs !== undefined ? { tools: toolDefs, toolChoice: "auto" } : {}),
        ...(messages.length > 0 ? { messages } : {}),
      });

      if (!result.ok) {
        return fail(
          new Error(`Provider "${request.provider}" request failed: ${result.error.message}`),
        );
      }

      const response = result.value;
      lastContent = typeof response.content === "string" ? response.content : "";
      lastModel = response.model ?? undefined;
      lastUsage = response.usage ?? undefined;

      const toolCalls = response.toolCalls;

      // No tool calls — final answer
      if (toolCalls === undefined || toolCalls.length === 0) {
        return ok({
          model: lastModel,
          content: lastContent,
          durationMs: Date.now() - startMs,
          tokenUsage: lastUsage,
          messages: [...messages],
        });
      }

      // Execute tool calls and build new messages
      messages.push({
        role: "assistant",
        content: lastContent,
        ...(toolCalls.length > 0
          ? {
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: tc.function,
              })),
            }
          : {}),
      });

      for (const toolCall of toolCalls) {
        const toolResult = await executeToolCall(this.toolSource, toolCall);
        messages.push({
          role: "tool",
          content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
          tool_call_id: toolCall.id,
        });
      }
    }

    // Max rounds reached — return last content with a truncation note
    const note = `\n\n[Tool loop ended after ${this.maxRounds} rounds — maximum iterations reached.]`;
    return ok({
      model: lastModel,
      content: lastContent + note,
      durationMs: Date.now() - startMs,
      tokenUsage: lastUsage,
      messages: [...messages],
    });
  }
}

/** Build the initial messages array from a ChatAgentRequest. */
function buildInitialMessages(request: ChatAgentRequest): ProviderMessage[] {
  const messages: ProviderMessage[] = [];
  if (request.prompt !== "") {
    messages.push({ role: "user", content: request.prompt });
  }
  return messages;
}

/** Execute a single tool call against the ContextToolSource. */
async function executeToolCall(toolSource: ContextToolSource, toolCall: ToolCall): Promise<string> {
  const name = toolCall.function.name;
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    return JSON.stringify({
      error: `Invalid JSON in tool arguments: ${toolCall.function.arguments}`,
    });
  }

  const result = await toolSource.execute(name, args);
  if (!result.ok) {
    return JSON.stringify({ error: result.error.message });
  }

  const value = result.value;
  const text = typeof value === "string" ? value : JSON.stringify(value);

  // Truncate oversized results
  if (text.length > MAX_TOOL_RESULT_CHARS) {
    return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n… [truncated]`;
  }
  return text;
}
