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
    const messages = buildOpenAIMessages(request);
    const body: Record<string, unknown> = {
      model,
      messages,
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.json === true ? { response_format: { type: "json_object" } } : {}),
      // Note: tools and toolChoice are OpenAI-specific; omitted for generic compat
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
    const usage = chatCompletionUsage(root);
    return ok({
      provider: this.name,
      content: chatCompletionContent(root),
      model: getString(root, "model") ?? model,
      usage: usage ?? undefined,
      toolCalls: undefined,
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

/** Build the messages array for the request. Uses `messages` when present, falls back to prompt. */
function buildOpenAIMessages(request: ProviderRequest): unknown[] {
  if (request.messages !== undefined && request.messages.length > 0) {
    return request.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_call_id !== undefined ? { tool_call_id: m.tool_call_id } : {}),
      // Assistant tool_calls must be forwarded verbatim — tool results correlate
      // to them by id, and servers reject `role: "tool"` messages otherwise.
      ...(m.tool_calls !== undefined ? { tool_calls: m.tool_calls } : {}),
    }));
  }
  return [
    ...(request.system !== undefined ? [{ role: "system", content: request.system }] : []),
    { role: "user", content: request.prompt },
  ];
}
