import type { Result } from "@atlas/shared";

/** Token counts for a single model call. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

/** A tool definition for function calling. */
export interface ToolDefinition {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description?: string;
    readonly parameters: Record<string, unknown>;
  };
}

/** A tool call returned by the model. */
export interface ToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

/** A single message in the conversation history. */
export interface ProviderMessage {
  /** Role: "system", "user", "assistant", or "tool". */
  readonly role: "system" | "user" | "assistant" | "tool";
  /** Text content of the message. */
  readonly content: string;
  /**
   * For `role: "tool"` messages, the id of the tool call this result answers.
   * Required for OpenAI-compatible APIs to correlate tool results with calls.
   */
  readonly tool_call_id?: string;
  /**
   * For `role: "assistant"` messages that include tool calls, the list of
   * tool calls requested by the model.
   */
  readonly tool_calls?: ReadonlyArray<{
    readonly id: string;
    readonly type: "function";
    readonly function: {
      readonly name: string;
      readonly arguments: string;
    };
  }>;
}

/** Input for a single completion request to a language model. */
export interface ProviderRequest {
  /** Provider adapter to use (e.g. `"claude"`); defaults to the service default. */
  readonly provider?: string;
  /** Model id override for the adapter's configured default model. */
  readonly model?: string;
  readonly prompt: string;
  readonly system?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Ask the model to respond with structured JSON. */
  readonly json?: boolean;
  /** Tool definitions for function calling. */
  readonly tools?: readonly ToolDefinition[];
  /** Tool choice control: "none", "auto", or specific function name. */
  readonly toolChoice?:
    | "none"
    | "auto"
    | { readonly type: "function"; readonly function: { readonly name: string } };
  /** Enable streaming response (NDJSON). */
  readonly stream?: boolean;
  /**
   * Full conversation history for multi-turn/tool-loop requests. When present,
   * adapters use this instead of constructing a single user message from
   * `prompt`. Each entry carries a role and content; tool results include the
   * `tool_call_id` that correlates them to the model's earlier tool request.
   */
  readonly messages?: readonly ProviderMessage[];
}

/** A completion returned by a language model. */
export interface ProviderResponse {
  /** The adapter/provider that produced the response (e.g. `"claude"`). */
  readonly provider: string;
  readonly content: string;
  readonly model: string;
  readonly usage: TokenUsage | undefined;
  /** Tool calls requested by the model (empty when none). */
  readonly toolCalls: readonly ToolCall[] | undefined;
}

/** Unified adapter over AI model APIs so providers can be swapped freely. */
export interface ProviderPort {
  complete(request: ProviderRequest): Promise<Result<ProviderResponse>>;
}
