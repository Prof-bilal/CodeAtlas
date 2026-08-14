import type { ProviderRequest, ProviderResponse, TokenUsage } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import type { ProviderAdapter, ProviderConfig } from "../adapter";
import { ProviderRequestError } from "../errors";
import { asObject, getNumber, getString, isOkStatus, usageFrom, withUsage } from "../parse";
import type { HttpResponse, HttpTransport } from "../transport";

/**
 * Ollama adapter.
 *
 * Supports both a **local** Ollama server (default `http://localhost:11434`,
 * no API key) and **Ollama Cloud** (a user-provided API key against a
 * configurable base URL). `ProviderConfig.apiKey` is optional — when absent the
 * request is sent unauthenticated (local mode).
 *
 * Chat uses the OpenAI-compatible `/v1/chat/completions` endpoint (shared by
 * local and cloud). Model listing uses the native `GET /api/tags` catalog.
 */
export class OllamaAdapter implements ProviderAdapter {
  public readonly name = "ollama";
  public readonly defaultModel: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly transport: HttpTransport;

  public constructor(config: ProviderConfig, transport: HttpTransport) {
    this.defaultModel = config.model ?? "llama3.2";
    this.baseUrl = config.baseUrl ?? "http://localhost:11434";
    this.apiKey = config.apiKey === "" ? undefined : config.apiKey;
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
      stream: false,
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.json === true ? { format: "json" } : {}),
    };
    const response = await this.transport.post(
      `${this.baseUrl}/v1/chat/completions`,
      this.headers(),
      body,
    );
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

  /** List model ids exposed by the Ollama server (local or cloud). */
  public async listModels(): Promise<Result<readonly string[]>> {
    let response: HttpResponse;
    try {
      response = await this.transport.get(`${this.baseUrl}/api/tags`, this.headers());
    } catch (error) {
      return fail(error instanceof Error ? error : new Error("Ollama request failed."));
    }
    if (!isOkStatus(response.status)) {
      return fail(new ProviderRequestError(this.name, response.status, response.json));
    }
    const root = asObject(response.json);
    const models = root?.["models"];
    const ids = Array.isArray(models)
      ? models.map((entry) => getString(asObject(entry), "name") ?? "").filter((id) => id !== "")
      : [];
    return ok(ids);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey !== undefined) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
}

function chatCompletionContent(root: Record<string, unknown> | null): string {
  const choicesValue = root?.["choices"];
  const choices = Array.isArray(choicesValue) ? choicesValue : [];
  const first = asObject(choices[0]);
  const message = asObject(first?.["message"]);
  const content = message?.["content"];
  return typeof content === "string" ? content : "";
}

function chatCompletionUsage(root: Record<string, unknown> | null): TokenUsage | null {
  const usage = asObject(root?.["usage"]);
  return usageFrom(getNumber(usage, "prompt_tokens"), getNumber(usage, "completion_tokens"));
}
