import { describe, expect, it } from "vitest";
import { ClaudeAdapter } from "../src/adapters/anthropic";
import { GeminiAdapter } from "../src/adapters/gemini";
import { OllamaAdapter } from "../src/adapters/ollama";
import { DeepSeekAdapter, OpenAIAdapter } from "../src/adapters/openai-compatible";
import { ProviderRequestError } from "../src/errors";
import { createFakeTransport } from "./helpers";

describe("provider adapters", () => {
  it("ClaudeAdapter parses the Anthropic Messages response", async () => {
    const fake = createFakeTransport([
      {
        status: 200,
        json: {
          content: [{ type: "text", text: '{"overview":"hi"}' }],
          model: "claude-sonnet-5",
          usage: { input_tokens: 7, output_tokens: 3 },
        },
      },
    ]);
    const adapter = new ClaudeAdapter({ apiKey: "test-key" }, fake.transport);
    const result = await adapter.complete({ prompt: "hello", json: true });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.content).toBe('{"overview":"hi"}');
    expect(result.value.model).toBe("claude-sonnet-5");
    expect(result.value.usage).toEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });

    const call = fake.calls[0];
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call.headers["x-api-key"]).toBe("test-key");
    expect((call.body as Record<string, unknown>)["max_tokens"]).toBe(1024);
  });

  it("OpenAIAdapter parses the chat-completions response and requests JSON", async () => {
    const fake = createFakeTransport([
      {
        status: 200,
        json: {
          choices: [{ message: { content: '{"overview":"hi"}' } }],
          model: "gpt-4o",
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        },
      },
    ]);
    const adapter = new OpenAIAdapter({ apiKey: "test-key" }, fake.transport);
    const result = await adapter.complete({
      prompt: "hello",
      system: "be terse",
      json: true,
      temperature: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.content).toBe('{"overview":"hi"}');
    expect(result.value.model).toBe("gpt-4o");
    expect(result.value.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });

    const body = fake.calls[0].body as Record<string, unknown>;
    expect(body["response_format"]).toEqual({ type: "json_object" });
    expect(body["temperature"]).toBe(0);
    const messages = body["messages"] as { role: string; content: string }[];
    expect(messages[0]).toEqual({ role: "system", content: "be terse" });
    expect(messages[1]).toEqual({ role: "user", content: "hello" });
  });

  it("DeepSeekAdapter posts to the OpenAI-compatible endpoint", async () => {
    const fake = createFakeTransport([
      { status: 200, json: { choices: [{ message: { content: "ok" } }], model: "deepseek-chat" } },
    ]);
    const adapter = new DeepSeekAdapter({ apiKey: "test-key" }, fake.transport);
    const result = await adapter.complete({ prompt: "hello", model: "deepseek-reasoner" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.model).toBe("deepseek-chat");
    const call = fake.calls[0];
    expect(call.url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect((call.body as Record<string, unknown>)["model"]).toBe("deepseek-reasoner");
  });

  it("GeminiAdapter parses the generateContent response and honors json mode", async () => {
    const fake = createFakeTransport([
      {
        status: 200,
        json: {
          candidates: [{ content: { parts: [{ text: '{"overview":"hi"}' }] } }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
        },
      },
    ]);
    const adapter = new GeminiAdapter({ apiKey: "test-key" }, fake.transport);
    const result = await adapter.complete({ prompt: "hello", json: true });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.content).toBe('{"overview":"hi"}');
    expect(result.value.model).toBe("gemini-2.5-pro");
    expect(result.value.usage).toEqual({ inputTokens: 4, outputTokens: 2, totalTokens: 6 });

    const call = fake.calls[0];
    expect(call.url).toContain("/models/gemini-2.5-pro:generateContent");
    const body = call.body as { generationConfig?: Record<string, unknown> };
    expect(body.generationConfig).toEqual({ responseMimeType: "application/json" });
  });

  it("OllamaAdapter talks to a local server without auth and lists models", async () => {
    const fake = createFakeTransport([
      {
        status: 200,
        json: {
          choices: [{ message: { content: "local answer" } }],
          model: "llama3.2",
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        },
      },
      { status: 200, json: { models: [{ name: "llama3.2" }, { name: "qwen3" }] } },
    ]);
    const adapter = new OllamaAdapter(
      { baseUrl: "http://localhost:11434", apiKey: "" },
      fake.transport,
    );

    const result = await adapter.complete({ prompt: "hello", json: true, temperature: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe("local answer");
      expect(result.value.usage).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
    }

    const chat = fake.calls[0];
    expect(chat.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(chat.headers["Authorization"]).toBeUndefined();
    const body = chat.body as Record<string, unknown>;
    expect(body["model"]).toBe("llama3.2");
    expect(body["format"]).toBe("json");
    expect(body["temperature"]).toBe(0);

    const listing = await adapter.listModels();
    expect(listing.ok).toBe(true);
    if (listing.ok) {
      expect(listing.value).toEqual(["llama3.2", "qwen3"]);
    }
    expect(fake.calls[1].url).toBe("http://localhost:11434/api/tags");
  });

  it("OllamaAdapter sends a Bearer key for cloud mode", async () => {
    const fake = createFakeTransport([
      {
        status: 200,
        json: { choices: [{ message: { content: "cloud answer" } }], model: "gpt-oss" },
      },
    ]);
    const adapter = new OllamaAdapter(
      { baseUrl: "https://ollama.example.com", apiKey: "ollama-key" },
      fake.transport,
    );
    const result = await adapter.complete({ prompt: "hello" });
    expect(result.ok).toBe(true);
    const call = fake.calls[0];
    expect(call.url).toBe("https://ollama.example.com/v1/chat/completions");
    expect(call.headers["Authorization"]).toBe("Bearer ollama-key");
  });

  it("OllamaAdapter surfaces a failed model listing as an error result", async () => {
    const fake = createFakeTransport([{ status: 500, json: { error: "down" } }]);
    const adapter = new OllamaAdapter({ apiKey: "" }, fake.transport);
    const result = await adapter.listModels();
    expect(result.ok).toBe(false);
  });

  it("fails with ProviderRequestError on a non-2xx response", async () => {
    const fake = createFakeTransport([{ status: 401, json: { error: { message: "bad key" } } }]);
    const adapter = new OpenAIAdapter({ apiKey: "bad" }, fake.transport);
    const result = await adapter.complete({ prompt: "hello" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(ProviderRequestError);
    const error = result.error as ProviderRequestError;
    expect(error.status).toBe(401);
    expect(error.provider).toBe("openai");
  });
});
