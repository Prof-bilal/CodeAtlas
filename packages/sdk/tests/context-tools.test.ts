import type { ProviderPort, ProviderResponse, ToolCall } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { SearchMemory, ToolUsingChatAgent, inspectResult } from "../src/context-tools/tool-loop";
import type { ToolLoopConfig } from "../src/context-tools/tool-loop";
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
              function: {
                name: "search_symbols",
                arguments: '{"query":"test"}',
              },
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
      expect(result.value.content).toContain("max-rounds");
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
      // The first user message is prefixed with the context guidance (Fix 1)
      const first = String(result.value.messages?.[0]?.content ?? "");
      expect(first).toContain("hello");
      expect(first).toContain("CodeAtlas has provided context");
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

    await agent.run({
      provider: "ollama",
      prompt: "test",
      repositoryPath: "/repo",
    });

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

    await agent.run({
      provider: "ollama",
      prompt: "test",
      repositoryPath: "/repo",
    });

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

    const result = await agent.run({
      provider: "ollama",
      prompt: "test",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const toolMsg = (result.value.messages ?? []).find((m) => m.role === "tool");
      expect(toolMsg?.content.length).toBeLessThanOrEqual(70);
      expect(toolMsg?.content).toContain("truncated");
    }
  });
});

describe("SearchMemory", () => {
  it("recalls exact queries (normalized)", () => {
    const memory = new SearchMemory();
    memory.remember("search_symbols:Auth", { hits: [1] });
    expect(memory.recall("search_symbols:auth")).toEqual({ hits: [1] });
    expect(memory.recall("search_symbols:  AUTH ")).toEqual({ hits: [1] });
    expect(memory.recall("search_symbols:other")).toBeUndefined();
  });

  it("treats near-duplicate queries as similar", () => {
    const memory = new SearchMemory();
    expect(memory.isSimilar("authenticate", "Authenticate")).toBe(true);
    expect(memory.isSimilar("authenticate", "authenticate!")).toBe(true);
    expect(memory.isSimilar("authenticate", "authentication")).toBe(true); // edit distance 1
    expect(memory.isSimilar("authenticate", "completely-different")).toBe(false);
  });
});

describe("ToolUsingChatAgent repeated queries, limits, guidance, progress", () => {
  /** Provider that issues toolCalls on round 0, then plain text. */
  function oneRoundProvider(toolCalls: readonly ToolCall[]): ProviderPort {
    let called = false;
    return {
      complete: async () => {
        if (!called) {
          called = true;
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
          content: "done",
          model: "llama3.2",
          usage: undefined,
          toolCalls: undefined,
        });
      },
    };
  }

  it("returns cached results for near-duplicate queries without re-executing", async () => {
    let executions = 0;
    const toolSource = fakeToolSource(
      [{ name: "search_symbols", description: "Search" }],
      async () => {
        executions += 1;
        return ok({ hits: ["hit"] });
      },
    );
    const provider = oneRoundProvider([
      {
        id: "call_1",
        type: "function",
        function: { name: "search_symbols", arguments: '{"query":"auth"}' },
      },
      {
        id: "call_2",
        type: "function",
        function: { name: "search_symbols", arguments: '{"query":"auth!"}' },
      },
    ]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "find auth",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The near-duplicate call must not re-execute the tool.
    expect(executions).toBe(1);
    const msgs = result.value.messages ?? [];
    const cachedMsg = msgs.find((m) => m.role === "tool" && m.content.includes("_cached"));
    expect(cachedMsg).toBeDefined();
  });

  it("enforces default per-tool call limits", async () => {
    let executions = 0;
    const toolSource = fakeToolSource(
      [{ name: "get_dependencies", description: "Deps" }],
      async () => {
        executions += 1;
        return ok({ edges: [] });
      },
    );
    const provider = oneRoundProvider([
      {
        id: "c1",
        type: "function",
        function: { name: "get_dependencies", arguments: '{"node":"a"}' },
      },
      {
        id: "c2",
        type: "function",
        function: { name: "get_dependencies", arguments: '{"node":"b"}' },
      },
    ]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "deps",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(executions).toBe(1);
    const msgs = result.value.messages ?? [];
    const limitMsg = msgs.find((m) => m.role === "tool" && m.content.includes("limit reached"));
    expect(limitMsg).toBeDefined();
  });

  it("enforces per-tool limits for MCP-prefixed tool names (codeatlas_*)", async () => {
    let executions = 0;
    const toolSource = fakeToolSource(
      [{ name: "codeatlas_search_symbols", description: "Search" }],
      async () => {
        executions += 1;
        return ok({ hits: [] });
      },
    );
    const provider = oneRoundProvider([
      {
        id: "p1",
        type: "function",
        function: { name: "codeatlas_search_symbols", arguments: '{"query":"a"}' },
      },
      {
        id: "p2",
        type: "function",
        function: { name: "codeatlas_search_symbols", arguments: '{"query":"b"}' },
      },
      {
        id: "p3",
        type: "function",
        function: { name: "codeatlas_search_symbols", arguments: '{"query":"c"}' },
      },
    ]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "search",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Default limit for search_symbols is 2 — the prefixed name must share it.
    expect(executions).toBe(2);
    const msgs = result.value.messages ?? [];
    const limitMsg = msgs.find((m) => m.role === "tool" && m.content.includes("limit reached"));
    expect(limitMsg).toBeDefined();
  });

  it("injects the context guidance into the first user message", async () => {
    const provider = fakeProvider({
      provider: "ollama",
      content: "answer",
      model: "llama3.2",
      usage: undefined,
      toolCalls: undefined,
    });
    const toolSource = fakeToolSource([]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);
    const result = await agent.run({
      provider: "ollama",
      prompt: "Do the task",
      repositoryPath: "/repo",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const msgs = result.value.messages ?? [];
    expect(msgs[0]?.role).toBe("user");
    expect(String(msgs[0]?.content)).toContain("Do NOT read files that are already in the context");
  });

  it("appends a progress note after repeated low-growth rounds", async () => {
    // Three rounds returning the same tiny result: rounds 2+ add almost no
    // new content relative to the biggest round so far.
    let round = 0;
    const provider: ProviderPort = {
      complete: async () => {
        round += 1;
        if (round <= 3) {
          return ok({
            provider: "ollama",
            content: "",
            model: "llama3.2",
            usage: undefined,
            toolCalls: [
              {
                id: `c${round}`,
                type: "function",
                function: {
                  name: "search_symbols",
                  arguments: `{"query":"q${round}"}`,
                },
              },
            ],
          });
        }
        return ok({
          provider: "ollama",
          content: "final",
          model: "llama3.2",
          usage: undefined,
          toolCalls: undefined,
        });
      },
    };
    const toolSource = fakeToolSource(
      [{ name: "search_symbols", description: "Search" }],
      async () => ok({ hits: ["x"] }),
    );
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"], 10, {
      perToolCallLimit: { search_symbols: 10 },
    });

    const result = await agent.run({
      provider: "ollama",
      prompt: "search a lot",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const msgs = result.value.messages ?? [];
    const progressMsg = msgs.find(
      (m) => m.role === "system" && String(m.content).includes("[Progress:"),
    );
    expect(progressMsg).toBeDefined();
  });
});

describe("inspectResult", () => {
  it("flags empty results", () => {
    const r = inspectResult("search_symbols", "");
    expect(r.empty).toBe(true);
    expect(r.informative).toBe(false);
    expect(r.recoveryMenu.length).toBeGreaterThan(0);
    expect(r.recoveryMenu[0]).toContain("no results");
  });

  it("flags empty object results", () => {
    const r = inspectResult("search_symbols", "{}");
    expect(r.empty).toBe(true);
  });

  it("flags error results", () => {
    const r = inspectResult("get_dependencies", '{"error":"node not found"}');
    expect(r.error).toBe(true);
    expect(r.recoveryMenu.length).toBeGreaterThan(0);
  });

  it("extracts file paths from results", () => {
    const r = inspectResult("search_symbols", "Found in /src/auth.ts and ./lib/user.ts");
    expect(r.filePaths).toContain("/src/auth.ts");
    expect(r.filePaths).toContain("./lib/user.ts");
  });

  it("extracts facts from informative results", () => {
    const r = inspectResult(
      "search_symbols",
      "AuthService is defined in auth.ts\nlogin() is an async function\nexported from index.ts",
    );
    expect(r.facts.length).toBeGreaterThan(0);
    expect(r.informative).toBe(true);
  });

  it("returns empty recovery menu for good results", () => {
    const r = inspectResult("search_symbols", "Found auth module with 3 symbols");
    expect(r.recoveryMenu).toEqual([]);
    expect(r.empty).toBe(false);
    expect(r.error).toBe(false);
  });
});

describe("ToolUsingChatAgent Phase 5: state tracking + stopReason + plan-aware rounds", () => {
  /** Provider that issues toolCalls on first call, then plain text. */
  function oneRoundProvider(toolCalls: readonly ToolCall[]): ProviderPort {
    let called = false;
    return {
      complete: async () => {
        if (!called) {
          called = true;
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
          content: "done",
          model: "llama3.2",
          usage: undefined,
          toolCalls: undefined,
        });
      },
    };
  }

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

  it("returns stopReason=final-answer on normal completion", async () => {
    const provider = fakeProvider({
      provider: "ollama",
      content: "answer",
      model: "llama3.2",
      usage: undefined,
      toolCalls: undefined,
    });
    const toolSource = fakeToolSource([]);
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);
    const result = await agent.run({
      provider: "ollama",
      prompt: "test",
      repositoryPath: "/repo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stopReason).toBe("final-answer");
    }
  });

  it("returns stopReason=max-rounds when max rounds hit", async () => {
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
              function: {
                name: "search_symbols",
                arguments: '{"query":"test"}',
              },
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
    if (result.ok) {
      expect(result.value.stopReason).toBe("max-rounds");
      expect(result.value.agentState).toBeDefined();
    }
  });

  it("returns stopReason=budget-exhausted when maxToolCalls hit via config", async () => {
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
              function: {
                name: "search_symbols",
                arguments: `{"query":"q${callCount}"}`,
              },
            },
          ],
        });
      },
    };
    const toolSource = fakeToolSource([{ name: "search_symbols", description: "Search" }]);
    const agent = new ToolUsingChatAgent(alwaysToolCall, toolSource, ["ollama"], 10, undefined, {
      maxToolCalls: 2,
    });
    const result = await agent.run({
      provider: "ollama",
      prompt: "search",
      repositoryPath: "/repo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stopReason).toBe("budget-exhausted");
    }
  });

  it("returns stopReason=budget-exhausted when maxTimeMs hit", async () => {
    const slowProvider: ProviderPort = {
      complete: async () => {
        // Simulate a slow provider by waiting
        await new Promise((resolve) => setTimeout(resolve, 50));
        return ok({
          provider: "ollama",
          content: "",
          model: "llama3.2",
          usage: undefined,
          toolCalls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "search_symbols", arguments: '{"query":"a"}' },
            },
          ],
        });
      },
    };
    const toolSource = fakeToolSource([{ name: "search_symbols", description: "Search" }]);
    // maxTimeMs=1ms should trigger immediately
    const agent = new ToolUsingChatAgent(slowProvider, toolSource, ["ollama"], 10, undefined, {
      maxTimeMs: 1,
    });
    const result = await agent.run({
      provider: "ollama",
      prompt: "search",
      repositoryPath: "/repo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stopReason).toBe("budget-exhausted");
    }
  });

  it("populates agentState with tool usage and files inspected", async () => {
    const toolCalls: ToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "search_symbols", arguments: '{"query":"auth"}' },
      },
    ];
    const provider = oneRoundProvider(toolCalls);
    const toolSource = fakeToolSource(
      [{ name: "search_symbols", description: "Search" }],
      async () => ok({ hits: [{ path: "/src/auth.ts" }] }),
    );
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);
    const result = await agent.run({
      provider: "ollama",
      prompt: "find auth",
      repositoryPath: "/repo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const state = result.value.agentState as Record<string, unknown>;
      expect(state).toBeDefined();
      const toolsUsed = state["toolsUsed"] as Array<Record<string, unknown>>;
      expect(toolsUsed.length).toBe(1);
      expect(toolsUsed[0]?.["name"]).toBe("search_symbols");
      expect(toolsUsed[0]?.["cached"]).toBe(false);
    }
  });

  it("injects state summary and objective restatement with plan steps", async () => {
    const provider = fakeProvider({
      provider: "ollama",
      content: "answer",
      model: "llama3.2",
      usage: undefined,
      toolCalls: undefined,
    });
    const toolSource = fakeToolSource([]);
    const config: ToolLoopConfig = {
      planSteps: [
        { order: 1, action: "read auth.ts", targetFiles: ["auth.ts"], rationale: "need context" },
      ],
      verificationStrategy: "claim-checks",
    };
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"], 10, undefined, config);
    const result = await agent.run({
      provider: "ollama",
      prompt: "fix auth bug",
      repositoryPath: "/repo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const msgs = result.value.messages ?? [];
      // The state summary should appear as a system message (after round 0)
      const stateMsg = msgs.find(
        (m) => m.role === "system" && String(m.content).includes("AgentState"),
      );
      expect(stateMsg).toBeDefined();
    }
  });

  it("inspects results and injects recovery menu for empty results", async () => {
    const toolCalls: ToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "search_symbols", arguments: '{"query":"nonexistent"}' },
      },
    ];
    const provider = oneRoundProvider(toolCalls);
    const toolSource = fakeToolSource(
      [{ name: "search_symbols", description: "Search" }],
      async () => ok(""),
    );
    const agent = new ToolUsingChatAgent(provider, toolSource, ["ollama"]);
    const result = await agent.run({
      provider: "ollama",
      prompt: "find xyz",
      repositoryPath: "/repo",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const msgs = result.value.messages ?? [];
      const recoveryMsg = msgs.find(
        (m) => m.role === "system" && String(m.content).includes("[ResultInspector]"),
      );
      expect(recoveryMsg).toBeDefined();
    }
  });
});
