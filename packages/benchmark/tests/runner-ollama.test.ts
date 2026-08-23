import type {
  ChatAgentPort,
  ChatAgentRequest,
  ChatAgentResult,
  ProviderMessage,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { OllamaRunner } from "../src/runner/ollama";

/** A fake ChatAgentPort that records requests and returns a fixed result. */
function fakeAgent(
  runImpl: (request: ChatAgentRequest) => Promise<Result<ChatAgentResult>>,
): ChatAgentPort & { readonly calls: readonly ChatAgentRequest[] } {
  const calls: ChatAgentRequest[] = [];
  return {
    providers: ["ollama"],
    handles: (provider) => provider === "ollama",
    run: async (request) => {
      calls.push(request);
      return runImpl(request);
    },
    get calls() {
      return calls;
    },
  };
}

function chatResult(overrides: Partial<ChatAgentResult> = {}): ChatAgentResult {
  return {
    model: "llama3.2",
    content: "answer",
    durationMs: 10,
    tokenUsage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 },
    messages: [],
    ...overrides,
  };
}

describe("OllamaRunner", () => {
  it("uses the baseline agent for baseline mode and the tool-loop agent for codeatlas mode", async () => {
    const baseline = fakeAgent(async () => ok(chatResult({ content: "baseline answer" })));
    const codeatlas = fakeAgent(async () => ok(chatResult({ content: "codeatlas answer" })));
    const runner = new OllamaRunner({ baseline, codeatlas });

    const base = await runner.execute({
      prompt: "p",
      repositoryPath: "/repo",
      mode: "baseline",
      timeoutMs: 5_000,
    });
    expect(base.ok).toBe(true);
    if (base.ok) {
      expect(base.value.finalText).toBe("baseline answer");
      expect(base.value.error).toBeUndefined();
    }
    expect(baseline.calls).toHaveLength(1);
    expect(codeatlas.calls).toHaveLength(0);

    const cat = await runner.execute({
      prompt: "p",
      repositoryPath: "/repo",
      mode: "codeatlas",
      timeoutMs: 5_000,
    });
    expect(cat.ok).toBe(true);
    if (cat.ok) {
      expect(cat.value.finalText).toBe("codeatlas answer");
    }
    expect(baseline.calls).toHaveLength(1);
    expect(codeatlas.calls).toHaveLength(1);
  });

  it("accepts a single agent for every mode (backwards compatible)", async () => {
    const agent = fakeAgent(async () => ok(chatResult()));
    const runner = new OllamaRunner(agent);

    for (const mode of ["baseline", "codeatlas"] as const) {
      const result = await runner.execute({
        prompt: "p",
        repositoryPath: "/repo",
        mode,
        timeoutMs: 5_000,
      });
      expect(result.ok).toBe(true);
    }
    expect(agent.calls).toHaveLength(2);
  });

  it("reports a timeout without waiting for the agent", async () => {
    const agent = fakeAgent(
      () =>
        new Promise<Result<ChatAgentResult>>((resolve) => {
          setTimeout(() => resolve(ok(chatResult())), 5_000);
        }),
    );
    const runner = new OllamaRunner(agent);

    const result = await runner.execute({
      prompt: "p",
      repositoryPath: "/repo",
      mode: "codeatlas",
      timeoutMs: 50,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timedOut).toBe(true);
      expect(result.value.error).toContain("timed out");
      expect(result.value.finalText).toBe("");
    }
  });

  it("surfaces agent failures as task errors", async () => {
    const agent = fakeAgent(async () => fail(new Error("provider down")));
    const runner = new OllamaRunner(agent);

    const result = await runner.execute({
      prompt: "p",
      repositoryPath: "/repo",
      mode: "baseline",
      timeoutMs: 5_000,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.error).toBe("provider down");
      expect(result.value.finalText).toBe("");
    }
  });

  it("marks policy-denied tool calls as errors and maps the rest as successful", async () => {
    const messages: ProviderMessage[] = [
      { role: "user", content: "p" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_ok",
            type: "function",
            function: { name: "search_symbols", arguments: "{}" },
          },
          {
            id: "call_denied",
            type: "function",
            function: { name: "read_file_range", arguments: "{}" },
          },
        ],
      },
    ];
    const agent = fakeAgent(async () =>
      ok(chatResult({ messages, deniedToolCalls: ["call_denied"] })),
    );
    const runner = new OllamaRunner(agent);

    const result = await runner.execute({
      prompt: "p",
      repositoryPath: "/repo",
      mode: "codeatlas",
      timeoutMs: 5_000,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toolCalls).toHaveLength(2);
      const ok1 = result.value.toolCalls.find((tc) => tc.callId === "call_ok");
      const denied = result.value.toolCalls.find((tc) => tc.callId === "call_denied");
      expect(ok1?.status).toBe("success");
      expect(ok1?.isError).toBe(false);
      expect(denied?.status).toBe("error");
      expect(denied?.isError).toBe(true);
    }
  });
});
