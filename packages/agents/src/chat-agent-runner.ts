import type { ChatAgentPort, ChatAgentRequest, ChatAgentResult, ProviderPort } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * A provider-backed chat agent runner that implements `ChatAgentPort`.
 *
 * Wraps a `ProviderPort` and exposes it as a `ChatAgentPort`. When `run()`
 * is called, it sends the prompt (or conversation history) to the provider's
 * `complete` method and returns the model's reply as the chat result.
 *
 * The provider must be listed in the runner's `providers` array (default:
 * `["ollama"]`). Provider adapters themselves handle model selection and
 * configuration; this runner only concerns itself with dispatching the
 * prompt and extracting the reply.
 */
export class ProviderChatAgent implements ChatAgentPort {
  public readonly providers: readonly string[];
  private readonly provider: ProviderPort;

  public constructor(provider: ProviderPort, providers: readonly string[] = ["ollama"]) {
    this.providers = providers;
    this.provider = provider;
  }

  /** @internal Check whether the given provider is handled by this runner. */
  public handles(provider: string): boolean {
    return this.providers.some((p) => p === provider);
  }

  /** Run one non-interactive chat turn for the given provider. */
  public async run(request: ChatAgentRequest): Promise<Result<ChatAgentResult>> {
    if (!this.handles(request.provider)) {
      return fail(new Error(`Provider "${request.provider}" is not handled by this runner`));
    }

    const startMs = Date.now();
    try {
      const result = await this.provider.complete({
        provider: request.provider,
        ...(request.model !== undefined ? { model: request.model } : {}),
        prompt: request.prompt,
        ...(request.messages !== undefined ? { messages: request.messages } : {}),
      });

      if (!result.ok) {
        return fail(
          new Error(`Provider "${request.provider}" request failed: ${result.error.message}`),
        );
      }

      const providerResponse = result.value;
      const content = typeof providerResponse.content === "string" ? providerResponse.content : "";
      const model = providerResponse.model ?? undefined;

      const chatResult: ChatAgentResult = {
        model,
        content,
        durationMs: Date.now() - startMs,
        tokenUsage: providerResponse.usage ?? undefined,
        executionTrace: {
          calls: [
            {
              callIndex: 1,
              round: 0,
              messageCount: request.messages?.length ?? 1,
              estimatedInputTokens:
                request.messages !== undefined && request.messages.length > 0
                  ? request.messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0)
                  : estimateTokens(request.prompt),
              toolSchemaTokens: 0,
              ...(providerResponse.usage?.inputTokens !== undefined
                ? { reportedInputTokens: providerResponse.usage.inputTokens }
                : {}),
              ...(providerResponse.usage?.outputTokens !== undefined
                ? { reportedOutputTokens: providerResponse.usage.outputTokens }
                : {}),
              ...(providerResponse.usage?.totalTokens !== undefined
                ? { reportedTotalTokens: providerResponse.usage.totalTokens }
                : {}),
            },
          ],
          messages: [
            {
              role: "user",
              source: "user-prompt",
              firstCallIndex: 1,
              contentChars:
                request.messages !== undefined && request.messages.length > 0
                  ? request.messages.reduce((sum, msg) => sum + msg.content.length, 0)
                  : request.prompt.length,
              estimatedTokens:
                request.messages !== undefined && request.messages.length > 0
                  ? request.messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0)
                  : estimateTokens(request.prompt),
            },
          ],
        },
      };

      return ok(chatResult);
    } catch (error) {
      return fail(
        new Error(`Provider "${request.provider}" request threw: ${(error as Error).message}`),
      );
    }
  }
}
