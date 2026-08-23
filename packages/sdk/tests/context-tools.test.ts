import type { ProviderPort, ProviderResponse, ToolCall } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { ToolUsingChatAgent } from "../src/context-tools/tool-loop";
import type { ContextToolSource } from "../src/context-tools/types";

/** A fake provider that returns a fixed response. */
function fakeProvider(response: ProviderResponse): ProviderPort {
  return { complete: async () => ok(response) };
}

/** A fake provider that returns tool calls on first call, then text. */
function toolCallThenTextProvider(
  toolCalls: readonly ToolCall[],
  finalContent: string,
): ProviderPort {
  let callCount = 0;
  return {
    complete: async () => {
      callCount++;
      if (callCount === 1) {
        return ok({
          provider: "ollama",
          content: "",
          model: "llama3.2",
          usage: undefined,
          toolCalls,
        });
      }
      return ok({
        provider: "ollama",
        content: finalContent,
        model: "llama3.2",
        usage: undefined,
        toolCalls: undefined,
      });
    },
  };
}

/** A fake tool source that echoes tool calls back. */
function fakeToolSource(
  tools: Array<{ name: string; description: string }>,
  executeFn?: (name: string, args: Record<string, unknown>) => Promise<Result<unknown>>,
): ContextToolSource {
  const toolNames = new Set(tools.map((t) => t.name));
  return {
    listTools: () =>
      tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: { type: "object" as const, properties: {} },
        },
      })),
    execute:
      executeFn ??
      (async (name, args) => {
        if (!toolNames.has(name)) {
          return fail(new Error(`Unknown tool: "${name}"`));
        }
        return ok({ tool: name, args });
      }),
  };
}

describe("ToolUsingChatAgent", () => {
  it("returns the provider's reply when no tool calls are made", async () => {
    const provider = fakeProvider({
      provider: "ollama",
      content: "The answer is 42.",
      model: "llama3.2",
      usage: undefined,
      toolCalls: undefined,
    });
    const toolSource = fakeToolSource([]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "What is the meaning of life?",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe("The answer is 42.");
      expect(result.value.model).toBe("llama3.2");
    }
  });

  it("executes tool calls and feeds results back", async () => {
    const toolCalls: ToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "search_symbols", arguments: '{"query":"auth"}' },
      },
    ];
    const provider = toolCallThenTextProvider(toolCalls, "Found auth module.");
    const toolSource = fakeToolSource([{ name: "search_symbols", description: "Search" }]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "Find the auth module",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe("Found auth module.");
      // Messages should include: user, assistant with tool_calls, tool result
      const msgs = result.value.messages ?? [];
      expect(msgs.length).toBeGreaterThanOrEqual(3);
      expect(msgs[0]?.role).toBe("user");
      expect(msgs[1]?.role).toBe("assistant");
      expect(msgs[2]?.role).toBe("tool");
      expect(msgs[2]?.tool_call_id).toBe("call_1");
    }
  });

  it("handles unknown tool names gracefully", async () => {
    const toolCalls: ToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "nonexistent_tool", arguments: "{}" },
      },
    ];
    const provider = toolCallThenTextProvider(toolCalls, "Done.");
    const toolSource = fakeToolSource([]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "Do something",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The tool result should contain an error message
      const msgs = result.value.messages ?? [];
      const toolMsg = msgs.find((m) => m.role === "tool");
      expect(toolMsg).toBeDefined();
      expect(toolMsg?.content).toContain("Unknown tool");
    }
  });

  it("handles invalid JSON in tool arguments", async () => {
    const toolCalls: ToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "search_symbols", arguments: "not-json" },
      },
    ];
    const provider = toolCallThenTextProvider(toolCalls, "Done.");
    const toolSource = fakeToolSource([{ name: "search_symbols", description: "Search" }]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "test",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const msgs = result.value.messages ?? [];
      const toolMsg = msgs.find((m) => m.role === "tool");
      expect(toolMsg?.content).toContain("Invalid JSON");
    }
  });

  it("respects maxRounds limit", async () => {
    // Provider always returns tool calls — should hit the max
    let callCount = 0;
    const alwaysToolCall: ProviderPort = {
      complete: async () => {
        callCount++;
        return ok({
          provider: "ollama",
          content: "",
          model: "llama3.2",
          usage: undefined,
          toolCalls: [
            {
              id: `call_${callCount}`,
              type: "function",
              function: { name: "search_symbols", arguments: '{"query":"test"}' },
            },
          ],
        });
      },
    };
    const toolSource = fakeToolSource([{ name: "search_symbols", description: "Search" }]);
    const agent = new ToolUsingChatAgent(alwaysToolCall, toolSource, ["ollama"], 3);

    const result = await agent.run({
      provider: "ollama",
      prompt: "search",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    // Should have made exactly 3 calls (the max)
    expect(callCount).toBe(3);
    if (result.ok) {
      expect(result.value.content).toContain("maximum iterations");
    }
  });

  it("rejects unknown providers", async () => {
    const provider = fakeProvider({
      provider: "ollama",
      content: "hi",
      model: "llama3.2",
      usage: undefined,
      toolCalls: undefined,
    });
    const toolSource = fakeToolSource([]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const result = await agent.run({
      provider: "claude",
      prompt: "test",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(false);
  });

  it("returns error when provider fails", async () => {
    const provider: ProviderPort = {
      complete: async () => fail(new Error("connection refused")),
    };
    const toolSource = fakeToolSource([]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "test",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(false);
  });

  it("truncates oversized tool results", async () => {
    const toolCalls: ToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "search_symbols", arguments: '{"query":"test"}' },
      },
    ];
    const provider = toolCallThenTextProvider(toolCalls, "Done.");
    const bigResult = "x".repeat(30_000);
    const toolSource = fakeToolSource(
      [{ name: "search_symbols", description: "Search" }],
      async () => ok(bigResult),
    );
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "test",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const msgs = result.value.messages ?? [];
      const toolMsg = msgs.find((m) => m.role === "tool");
      expect(toolMsg?.content.length).toBeLessThan(30_000);
      expect(toolMsg?.content).toContain("truncated");
    }
  });

  it("forwards messages from request when present", async () => {
    const provider = fakeProvider({
      provider: "ollama",
      content: "continuing...",
      model: "llama3.2",
      usage: undefined,
      toolCalls: undefined,
    });
    const toolSource = fakeToolSource([]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const messages = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "hi there" },
      { role: "user" as const, content: "what about tools?" },
    ];
    const result = await agent.run({
      provider: "ollama",
      prompt: "continue",
      repositoryPath: "/repo",
      messages,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Messages should be preserved (copied from request)
      expect(result.value.messages?.length).toBeGreaterThanOrEqual(3);
      expect(result.value.messages?.[0]?.content).toBe("hello");
    }
  });

  it("handles() returns true for configured providers", () => {
    const provider = fakeProvider({
      provider: "ollama",
      content: "",
      model: "llama3.2",
      usage: undefined,
      toolCalls: undefined,
    });
    const toolSource = fakeToolSource([]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);
    expect(agent.handles("ollama")).toBe(true);
    expect(agent.handles("claude")).toBe(false);
  });

  it("passes the requested provider id through to the provider port", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const provider: ProviderPort = {
      complete: async (request) => {
        requests.push(request as unknown as Record<string, unknown>);
        return ok({
          provider: "ollama",
          content: "done",
          model: "llama3.2",
          usage: undefined,
          toolCalls: undefined,
        });
      },
    };
    const toolSource = fakeToolSource([]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    await agent.run({ provider: "ollama", prompt: "test", repositoryPath: "/repo" });

    expect(requests[0]?.["provider"]).toBe("ollama");
  });
});

describe("ToolUsingChatAgent tool-call policy", () => {
  /** Provider fake that records every complete() request. */
  function capturingProvider(
    respond: (callIndex: number) => ProviderResponse,
  ): ProviderPort & { readonly requests: Array<Record<string, unknown>> } {
    const requests: Array<Record<string, unknown>> = [];
    let index = 0;
    return {
      complete: async (request) => {
        requests.push(request as unknown as Record<string, unknown>);
        return ok(respond(index++));
      },
      get requests() {
        return requests;
      },
    };
  }

  function toolCall(id: string, name: string): ToolCall {
    return { id, type: "function", function: { name, arguments: "{}" } };
  }

  it("denies calls to tools on the denied list, returns an error result, and records the denial", async () => {
    const provider = capturingProvider((i) =>
      i === 0
        ? {
            provider: "ollama",
            content: "",
            model: "llama3.2",
            usage: undefined,
            toolCalls: [toolCall("call_1", "read_file_range")],
          }
        : {
            provider: "ollama",
            content: "final answer without the file",
            model: "llama3.2",
            usage: undefined,
            toolCalls: undefined,
          },
    );
    let executed = 0;
    const toolSource = fakeToolSource(
      [{ name: "read_file_range", description: "Read" }],
      async () => {
        executed += 1;
        return ok("file contents");
      },
    );
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"], 10, {
      deniedTools: ["read_file_range"],
    });

    const result = await agent.run({
      provider: "ollama",
      prompt: "read the file",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe("final answer without the file");
      expect(result.value.deniedToolCalls).toEqual(["call_1"]);
      const msgs = result.value.messages ?? [];
      const toolMsg = msgs.find((m) => m.role === "tool");
      expect(toolMsg?.content).toContain("denied by policy");
    }
    expect(executed).toBe(0);
  });

  it("offers only allowed tools to the model", async () => {
    const provider = capturingProvider(() => ({
      provider: "ollama",
      content: "done",
      model: "llama3.2",
      usage: undefined,
      toolCalls: undefined,
    }));
    const toolSource = fakeToolSource([
      { name: "search_symbols", description: "Search" },
      { name: "read_file_range", description: "Read" },
      { name: "project_overview", description: "Overview" },
    ]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"], 10, {
      allowedTools: ["search_symbols", "project_overview"],
    });

    await agent.run({ provider: "ollama", prompt: "test", repositoryPath: "/repo" });

    const offered = (provider.requests[0]?.["tools"] as Array<{ function: { name: string } }>).map(
      (t) => t.function.name,
    );
    expect(offered).toEqual(["search_symbols", "project_overview"]);
  });

  it("enforces the maxToolCalls budget with an explicit denial reason", async () => {
    // Always requests two calls per round; budget allows only one execution.
    const provider = capturingProvider((i) => ({
      provider: "ollama",
      content: i === 0 ? "" : "budgeted answer",
      model: "llama3.2",
      usage: undefined,
      toolCalls:
        i === 0
          ? [toolCall("call_a", "search_symbols"), toolCall("call_b", "search_symbols")]
          : undefined,
    }));
    const toolSource = fakeToolSource([{ name: "search_symbols", description: "Search" }]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"], 10, {
      maxToolCalls: 1,
    });

    const result = await agent.run({
      provider: "ollama",
      prompt: "search twice",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.deniedToolCalls).toEqual(["call_b"]);
      const msgs = result.value.messages ?? [];
      const budgetMsg = msgs.find((m) => m.role === "tool" && m.content.includes("budget"));
      expect(budgetMsg).toBeDefined();
    }
  });

  it("honors a smaller maxResultChars from the policy", async () => {
    const provider = capturingProvider((i) =>
      i === 0
        ? {
            provider: "ollama",
            content: "",
            model: "llama3.2",
            usage: undefined,
            toolCalls: [toolCall("call_1", "search_symbols")],
          }
        : {
            provider: "ollama",
            content: "done",
            model: "llama3.2",
            usage: undefined,
            toolCalls: undefined,
          },
    );
    const toolSource = fakeToolSource(
      [{ name: "search_symbols", description: "Search" }],
      async () => ok(`${"x".repeat(500)}`),
    );
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"], 10, {
      maxResultChars: 50,
    });

    const result = await agent.run({ provider: "ollama", prompt: "test", repositoryPath: "/repo" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const toolMsg = (result.value.messages ?? []).find((m) => m.role === "tool");
      expect(toolMsg?.content.length).toBeLessThanOrEqual(70);
      expect(toolMsg?.content).toContain("truncated");
    }
  });
});
