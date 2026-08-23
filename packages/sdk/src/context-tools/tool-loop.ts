import type {
  ChatAgentPort,
  ChatAgentRequest,
  ChatAgentResult,
  ProviderMessage,
  ProviderPort,
  ToolCall,
  ToolDefinition,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import type { ContextToolSource, ToolCallPolicy } from "./types";
import { MAX_TOOL_RESULT_CHARS, MAX_TOOL_ROUNDS, evaluateToolCallPolicy } from "./types";

/**
 * A chat agent that wraps a `ProviderPort` and runs a bounded tool loop.
 *
 * When the model responds with `tool_calls`, this agent executes them against
 * the injected `ContextToolSource`, feeds the results back as `role: "tool"`
 * messages, and re-calls the provider. The loop terminates when:
 * - The model responds without tool calls (final answer).
 * - `MAX_TOOL_ROUNDS` is reached (returns the last content with a note).
 * - An unknown tool is called (returns an error result to the model).
 *
 * An optional `ToolCallPolicy` restricts which tools are offered and executed
 * (advisory security surface): denied calls receive an error result the model
 * can react to, and the denied call ids are surfaced on the result.
 */
export class ToolUsingChatAgent implements ChatAgentPort {
  public readonly providers: readonly string[];
  private readonly provider: ProviderPort;
  private readonly toolSource: ContextToolSource;
  private readonly maxRounds: number;
  private readonly policy: ToolCallPolicy | undefined;

  public constructor(
    provider: ProviderPort,
    toolSource: ContextToolSource,
    providers: readonly string[] = ["ollama"],
    maxRounds: number = MAX_TOOL_ROUNDS,
    policy?: ToolCallPolicy,
  ) {
    this.providers = providers;
    this.provider = provider;
    this.toolSource = toolSource;
    this.maxRounds = maxRounds;
    this.policy = policy;
  }

  public handles(provider: string): boolean {
    return this.providers.some((p) => p === provider);
  }

  public async run(request: ChatAgentRequest): Promise<Result<ChatAgentResult>> {
    if (!this.handles(request.provider)) {
      return fail(new Error(`Provider "${request.provider}" is not handled by this runner`));
    }

    const tools = this.offeredTools();
    const startMs = Date.now();
    const messages =
      request.messages !== undefined ? [...request.messages] : buildInitialMessages(request);
    const toolDefs = tools.length > 0 ? tools : undefined;
    const maxResultChars = this.policy?.maxResultChars ?? MAX_TOOL_RESULT_CHARS;

    let lastContent = "";
    let lastModel: string | undefined;
    let lastUsage: ChatAgentResult["tokenUsage"] = undefined;
    let executedCalls = 0;
    const deniedToolCalls: string[] = [];

    for (let round = 0; round < this.maxRounds; round++) {
      const result = await this.provider.complete({
        provider: request.provider,
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
          ...(deniedToolCalls.length > 0 ? { deniedToolCalls: [...deniedToolCalls] } : {}),
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
        const decision = this.decide(toolCall, executedCalls);
        if (!decision.allowed) {
          deniedToolCalls.push(toolCall.id);
          messages.push({
            role: "tool",
            content: JSON.stringify({ error: decision.reason }),
            tool_call_id: toolCall.id,
          });
          continue;
        }

        const toolResult = await executeToolCall(this.toolSource, toolCall, maxResultChars);
        executedCalls += 1;
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
      ...(deniedToolCalls.length > 0 ? { deniedToolCalls: [...deniedToolCalls] } : {}),
    });
  }

  /** Tool definitions offered to the model after applying the policy. */
  private offeredTools(): readonly ToolDefinition[] {
    const all = this.toolSource.listTools();
    if (this.policy === undefined) {
      return all;
    }
    return all.filter((tool) => evaluateToolCallPolicy(this.policy, tool.function.name).allowed);
  }

  /** Decide whether one requested call may execute (name allow/deny + budget). */
  private decide(toolCall: ToolCall, executedCalls: number): { allowed: boolean; reason?: string } {
    const decision = evaluateToolCallPolicy(this.policy, toolCall.function.name);
    if (!decision.allowed) {
      return decision;
    }
    const max = this.policy?.maxToolCalls;
    if (max !== undefined && executedCalls >= max) {
      return {
        allowed: false,
        reason: `Tool call budget exhausted (${max} call${max === 1 ? "" : "s"} per run)`,
      };
    }
    return { allowed: true };
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
async function executeToolCall(
  toolSource: ContextToolSource,
  toolCall: ToolCall,
  maxResultChars: number,
): Promise<string> {
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
  if (text.length > maxResultChars) {
    return `${text.slice(0, maxResultChars)}\n… [truncated]`;
  }
  return text;
}
