import { describe, expect, it } from "vitest";
import { OllamaAdapter } from "../src/adapters/ollama";
import { createFakeTransport } from "./helpers";

describe("OllamaAdapter — messages support", () => {
  it("uses prompt/system when messages is absent (backward compatible)", async () => {
    const { transport, calls } = createFakeTransport([
      { status: 200, json: { choices: [{ message: { content: "hi" } }], model: "llama3.2" } },
    ]);
    const adapter = new OllamaAdapter({ apiKey: "", baseUrl: "http://fake" }, transport);

    await adapter.complete({ prompt: "Hello", system: "You are helpful." });

    expect(calls.length).toBe(1);
    const body = calls[0]?.body as Record<string, unknown>;
    const messages = body["messages"] as Array<Record<string, unknown>>;
    expect(messages).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ]);
  });

  it("uses messages array when present", async () => {
    const { transport, calls } = createFakeTransport([
      { status: 200, json: { choices: [{ message: { content: "ok" } }], model: "llama3.2" } },
    ]);
    const adapter = new OllamaAdapter({ apiKey: "", baseUrl: "http://fake" }, transport);

    await adapter.complete({
      prompt: "ignored",
      messages: [
        { role: "user", content: "What is auth?" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "c1",
              type: "function",
              function: { name: "search_symbols", arguments: '{"query":"auth"}' },
            },
          ],
        },
        { role: "tool", content: '{"hits":[]}', tool_call_id: "c1" },
        { role: "user", content: "Now show me the module." },
      ],
    });

    expect(calls.length).toBe(1);
    const body = calls[0]?.body as Record<string, unknown>;
    const messages = body["messages"] as Array<Record<string, unknown>>;
    expect(messages.length).toBe(4);
    expect(messages[0]).toEqual({ role: "user", content: "What is auth?" });
    // Assistant tool_calls must be forwarded — servers reject tool messages
    // whose tool_call_id has no matching assistant tool call.
    expect(messages[1]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "c1",
          type: "function",
          function: { name: "search_symbols", arguments: '{"query":"auth"}' },
        },
      ],
    });
    expect(messages[2]).toEqual({ role: "tool", content: '{"hits":[]}', tool_call_id: "c1" });
    expect(messages[3]).toEqual({ role: "user", content: "Now show me the module." });
  });

  it("sends tools when present alongside messages", async () => {
    const { transport, calls } = createFakeTransport([
      { status: 200, json: { choices: [{ message: { content: "ok" } }], model: "llama3.2" } },
    ]);
    const adapter = new OllamaAdapter({ apiKey: "", baseUrl: "http://fake" }, transport);

    await adapter.complete({
      prompt: "test",
      messages: [{ role: "user", content: "test" }],
      tools: [
        {
          type: "function",
          function: {
            name: "search_symbols",
            description: "Search",
            parameters: { type: "object", properties: { query: { type: "string" } } },
          },
        },
      ],
    });

    const body = calls[0]?.body as Record<string, unknown>;
    expect(body["tools"]).toBeDefined();
    expect((body["tools"] as unknown[]).length).toBe(1);
  });
});
