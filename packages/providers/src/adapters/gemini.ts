import type { ProviderRequest, ProviderResponse, TokenUsage } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import type { ProviderAdapter, ProviderConfig } from "../adapter";
import { ProviderRequestError } from "../errors";
import { asObject, getNumber, getString, isOkStatus, usageFrom, withUsage } from "../parse";
import type { HttpTransport } from "../transport";

/** Gemini adapter for the `generateContent` REST API. */
export class GeminiAdapter implements ProviderAdapter {
  public readonly name = "gemini";
  public readonly defaultModel: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly transport: HttpTransport;

  public constructor(config: ProviderConfig, transport: HttpTransport) {
    this.defaultModel = config.model ?? "gemini-1.5-pro";
    this.baseUrl = config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    this.apiKey = config.apiKey;
    this.transport = transport;
  }

  public async complete(request: ProviderRequest): Promise<Result<ProviderResponse>> {
    const model = request.model ?? this.defaultModel;
    const generationConfig: Record<string, unknown> = {
      ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.json === true ? { responseMimeType: "application/json" } : {}),
    };
    const body: Record<string, unknown> = {
      contents: [{ parts: [{ text: request.prompt }] }],
      ...(request.system !== undefined
        ? { systemInstruction: { parts: [{ text: request.system }] } }
        : {}),
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    };
    const response = await this.transport.post(
      `${this.baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      { "Content-Type": "application/json" },
      body,
    );
    if (!isOkStatus(response.status)) {
      return fail(new ProviderRequestError(this.name, response.status, response.json));
    }
    const root = asObject(response.json);
    return ok({
      provider: this.name,
      content: geminiText(root),
      model,
      ...withUsage(geminiUsage(root)),
    });
  }
}

function geminiText(root: Record<string, unknown> | null): string {
  const candidatesValue = root?.["candidates"];
  const candidates = Array.isArray(candidatesValue) ? candidatesValue : [];
  const first = asObject(candidates[0]);
  const content = asObject(first?.["content"]);
  const partsValue = content?.["parts"];
  const parts = Array.isArray(partsValue) ? partsValue : [];
  const texts: string[] = [];
  for (const part of parts) {
    const obj = asObject(part);
    const text = getString(obj, "text");
    if (text !== undefined) {
      texts.push(text);
    }
  }
  return texts.join("\n");
}

function geminiUsage(root: Record<string, unknown> | null): TokenUsage | null {
  const usage = asObject(root?.["usageMetadata"]);
  return usageFrom(getNumber(usage, "promptTokenCount"), getNumber(usage, "candidatesTokenCount"));
}
