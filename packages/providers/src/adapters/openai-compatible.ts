import type { ProviderRequest, ProviderResponse } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import type { ProviderAdapter, ProviderConfig } from "../adapter";
import { ProviderNetworkError, ProviderRequestError } from "../errors";
import {
  asObject,
  chatCompletionContent,
  chatCompletionUsage,
  getString,
  isOkStatus,
  withUsage,
} from "../parse";
import type { HttpResponse, HttpTransport } from "../transport";

/**
 * Base adapter for OpenAI-compatible chat-completions APIs. Subclasses provide
 * the provider id, default model, and base URL.
 */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  public readonly name: string;
  public readonly defaultModel: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly transport: HttpTransport;

  public constructor(
    name: string,
    defaultModel: string,
    baseUrl: string,
    config: ProviderConfig,
    transport: HttpTransport,
  ) {
    this.name = name;
    this.defaultModel = config.model ?? defaultModel;
    this.baseUrl = config.baseUrl ?? baseUrl;
    this.apiKey = config.apiKey;
    this.transport = transport;
  }

  public async complete(request: ProviderRequest): Promise<Result<ProviderResponse>> {
    const model = request.model ?? this.defaultModel;
    const messages: unknown[] = [
      ...(request.system !== undefined ? [{ role: "system", content: request.system }] : []),
      { role: "user", content: request.prompt },
    ];
    const body: Record<string, unknown> = {
      model,
      messages,
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.json === true ? { response_format: { type: "json_object" } } : {}),
    };
    let response: HttpResponse;
    try {
      response = await this.transport.post(
        `${this.baseUrl}/chat/completions`,
        { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body,
      );
    } catch (error) {
      return fail(new ProviderNetworkError(this.name, error));
    }
    if (!isOkStatus(response.status)) {
      return fail(new ProviderRequestError(this.name, response.status, response.json));
    }
    const root = asObject(response.json);
    return ok({
      provider: this.name,
      content: chatCompletionContent(root),
      model: getString(root, "model") ?? model,
      ...withUsage(chatCompletionUsage(root)),
    });
  }
}

/** OpenAI adapter (`gpt-5.6` default). */
export class OpenAIAdapter extends OpenAICompatibleAdapter {
  public constructor(config: ProviderConfig, transport: HttpTransport) {
    super("openai", "gpt-5.6", "https://api.openai.com/v1", config, transport);
  }
}

/** DeepSeek adapter (OpenAI-compatible API). */
export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  public constructor(config: ProviderConfig, transport: HttpTransport) {
    super("deepseek", "deepseek-v4-flash", "https://api.deepseek.com/v1", config, transport);
  }
}
