import type { ChatAgentPort, ChatAgentRequest, ChatAgentResult, ProviderPort } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";

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

      return ok({
        model,
        content,
        durationMs: Date.now() - startMs,
        tokenUsage: providerResponse.usage ?? undefined,
      });
    } catch (error) {
      return fail(
        new Error(`Provider "${request.provider}" request threw: ${(error as Error).message}`),
      );
    }
  }
}
