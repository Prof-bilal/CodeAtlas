import type { ProviderRequest, ProviderResponse, TokenUsage } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import type { ProviderAdapter, ProviderConfig } from "../adapter";
import { ProviderRequestError } from "../errors";
import { asObject, getNumber, getString, isOkStatus, usageFrom, withUsage } from "../parse";
import type { HttpTransport } from "../transport";

/**
 * Claude adapter for the Anthropic Messages API. Anthropic has no
 * `response_format` knob, so `ProviderRequest.json` is honored via the prompt
 * instruction only.
 */
export class ClaudeAdapter implements ProviderAdapter {
  public readonly name = "claude";
  public readonly defaultModel: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly transport: HttpTransport;

  public constructor(config: ProviderConfig, transport: HttpTransport) {
    this.defaultModel = config.model ?? "claude-sonnet-5";
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
    this.apiKey = config.apiKey;
    this.transport = transport;
  }

  public async complete(request: ProviderRequest): Promise<Result<ProviderResponse>> {
    const model = request.model ?? this.defaultModel;
    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens ?? 1024,
      messages: [{ role: "user", content: request.prompt }],
      ...(request.system !== undefined ? { system: request.system } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    };
    const response = await this.transport.post(
      `${this.baseUrl}/messages`,
      {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body,
    );
    if (!isOkStatus(response.status)) {
      return fail(new ProviderRequestError(this.name, response.status, response.json));
    }
    const root = asObject(response.json);
    return ok({
      provider: this.name,
      content: anthropicText(root),
      model: getString(root, "model") ?? model,
      ...withUsage(anthropicUsage(root)),
    });
  }
}

function anthropicText(root: Record<string, unknown> | null): string {
  const content = root?.["content"];
  const blocks = Array.isArray(content) ? content : [];
  for (const block of blocks) {
    const obj = asObject(block);
    if (getString(obj, "type") === "text") {
      const text = getString(obj, "text");
      if (text !== undefined) {
        return text;
      }
    }
  }
  return "";
}

function anthropicUsage(root: Record<string, unknown> | null): TokenUsage | null {
  const usage = asObject(root?.["usage"]);
  return usageFrom(getNumber(usage, "input_tokens"), getNumber(usage, "output_tokens"));
}
