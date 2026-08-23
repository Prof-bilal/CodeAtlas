import type { ProviderRequest, ProviderResponse, ToolCall } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import type { ProviderAdapter, ProviderConfig } from "../adapter";
import { ProviderNetworkError, ProviderRequestError } from "../errors";
import {
  asObject,
  chatCompletionContent,
  chatCompletionToolCalls,
  chatCompletionUsage,
  getString,
  isOkStatus,
} from "../parse";
import { withRetry } from "../retry";
import type { HttpResponse, HttpTransport, StreamChunk } from "../transport";

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
    const messages = buildMessages(request);
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: request.stream === true,
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.json === true ? { format: "json" } : {}),
      ...(request.tools !== undefined && request.tools.length > 0 ? { tools: request.tools } : {}),
      ...(request.toolChoice !== undefined ? { tool_choice: request.toolChoice } : {}),
    };

    if (request.stream === true) {
      return this.streamComplete(body);
    }

    return withRetry(async () => {
      let response: HttpResponse;
      try {
        response = await this.transport.post(
          `${this.baseUrl}/v1/chat/completions`,
          this.headers(),
          body,
        );
      } catch (error) {
        return fail(new ProviderNetworkError(this.name, error));
      }
      if (!isOkStatus(response.status)) {
        return fail(new ProviderRequestError(this.name, response.status, response.json));
      }
      const root = asObject(response.json);
      const toolCalls = chatCompletionToolCalls(root);
      const usage = chatCompletionUsage(root);
      const result: ProviderResponse = {
        provider: this.name,
        content: chatCompletionContent(root),
        model: getString(root, "model") ?? model,
        usage: usage ?? undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      return ok(result);
    });
  }

  private async streamComplete(body: Record<string, unknown>): Promise<Result<ProviderResponse>> {
    let accumulatedContent = "";
    const accumulatedToolCalls: ToolCall[] = [];
    let finalUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null =
      null;
    const finalModel = body["model"] as string;

    try {
      await this.transport.postStream(
        `${this.baseUrl}/v1/chat/completions`,
        this.headers(),
        body,
        (chunk: StreamChunk) => {
          accumulatedContent += chunk.text;
          if (chunk.toolCalls && chunk.toolCalls.length > 0) {
            // Merge tool calls by id
            for (const tc of chunk.toolCalls) {
              const existingIndex = accumulatedToolCalls.findIndex((atc) => atc.id === tc.id);
              if (existingIndex >= 0) {
                // Append arguments
                accumulatedToolCalls[existingIndex] = {
                  ...accumulatedToolCalls[existingIndex],
                  function: {
                    ...accumulatedToolCalls[existingIndex].function,
                    arguments:
                      accumulatedToolCalls[existingIndex].function.arguments +
                      tc.function.arguments,
                  },
                };
              } else {
                accumulatedToolCalls.push(tc);
              }
            }
          }
          if (chunk.usage) {
            finalUsage = chunk.usage;
          }
        },
      );
    } catch (error) {
      return fail(new ProviderNetworkError(this.name, error));
    }

    const result: ProviderResponse = {
      provider: this.name,
      content: accumulatedContent,
      model: finalModel,
      usage: finalUsage ?? undefined,
      toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
    };
    return ok(result);
  }

  /** List model ids exposed by the Ollama server (local or cloud). */
  public async listModels(): Promise<Result<readonly string[]>> {
    return withRetry(async () => {
      let response: HttpResponse;
      try {
        response = await this.transport.get(`${this.baseUrl}/api/tags`, this.headers());
      } catch (error) {
        return fail(new ProviderNetworkError(this.name, error));
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
    });
  }

  /** Probe the server version via `/api/version` for a more explicit health check. */
  public async checkVersion(): Promise<Result<string>> {
    return withRetry(async () => {
      let response: HttpResponse;
      try {
        response = await this.transport.get(`${this.baseUrl}/api/version`, this.headers());
      } catch (error) {
        return fail(new ProviderNetworkError(this.name, error));
      }
      if (!isOkStatus(response.status)) {
        return fail(new ProviderRequestError(this.name, response.status, response.json));
      }
      const root = asObject(response.json);
      const version = getString(root, "version") ?? "unknown";
      return ok(version);
    });
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey !== undefined) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
}

/** Build the messages array for the request. Uses `messages` when present, falls back to prompt. */
function buildMessages(request: ProviderRequest): unknown[] {
  if (request.messages !== undefined && request.messages.length > 0) {
    return request.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_call_id !== undefined ? { tool_call_id: m.tool_call_id } : {}),
    }));
  }
  return [
    ...(request.system !== undefined ? [{ role: "system", content: request.system }] : []),
    { role: "user", content: request.prompt },
  ];
}
