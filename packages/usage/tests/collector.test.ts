import type { AgentRunResult, ProviderPort, ProviderResponse, TokenUsage } from "@atlas/core";
import { ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { estimateTokens, normalizeEvent, trackAgentRun, withUsageTracking } from "../src";
import { createTestUsage } from "./helpers";

function fakeProvider(
  response: { provider?: string; model?: string; content: string },
  usage: TokenUsage | undefined,
): ProviderPort {
  return {
    async complete() {
      const value: ProviderResponse = {
        provider: response.provider ?? "claude",
        content: response.content,
        model: response.model ?? "claude-sonnet-5",
        usage,
        toolCalls: undefined,
      };
      return ok(value);
    },
  };
}

describe("normalizeEvent — tri-state tokens", () => {
  it("labels provider-reported tokens actual", () => {
    const record = normalizeEvent(
      {
        source: "provider",
        provider: "claude",
        model: "claude-sonnet-5",
        latencyMs: 10,
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
      },
      "id-1",
    );
    expect(record.tokens.input).toEqual({ source: "actual", value: 100 });
    expect(record.tokens.output).toEqual({ source: "actual", value: 200 });
    expect(record.tokens.total).toEqual({ source: "actual", value: 300 });
  });

  it("derives total from input + output when the total is missing", () => {
    const record = normalizeEvent(
      {
        source: "provider",
        provider: "claude",
        model: "claude-sonnet-5",
        latencyMs: 10,
        inputTokens: 100,
        outputTokens: 200,
      },
      "id-2",
    );
    expect(record.tokens.total).toEqual({ source: "actual", value: 300 });
  });

  it("keeps a missing reported total unknown", () => {
    const record = normalizeEvent(
      {
        source: "provider",
        provider: "claude",
        model: "claude-sonnet-5",
        latencyMs: 10,
        inputTokens: 100,
      },
      "id-3",
    );
    expect(record.tokens.input).toEqual({ source: "actual", value: 100 });
    expect(record.tokens.output.source).toBe("unknown");
    expect(record.tokens.total.source).toBe("unknown");
    expect(record.tokens.output.value).toBeNull();
  });

  it("keeps everything unknown when the provider reports no usage", () => {
    const record = normalizeEvent(
      { source: "provider", provider: "claude", model: "claude-sonnet-5", latencyMs: 10 },
      "id-4",
    );
    expect(record.tokens.input.source).toBe("unknown");
    expect(record.tokens.output.source).toBe("unknown");
    expect(record.tokens.total.source).toBe("unknown");
  });

  it("labels opt-in estimates estimated — never actual", () => {
    const record = normalizeEvent(
      {
        source: "provider",
        provider: "claude",
        model: "claude-sonnet-5",
        latencyMs: 10,
        estimatedInputTokens: 25,
        estimatedOutputTokens: 75,
      },
      "id-5",
    );
    expect(record.tokens.input).toMatchObject({ source: "estimated", value: 25 });
    expect(record.tokens.output).toMatchObject({ source: "estimated", value: 75 });
    expect(record.tokens.total).toMatchObject({ source: "estimated", value: 100 });
  });

  it("defaults agent to the provider and leaves correlation fields null", () => {
    const record = normalizeEvent(
      { source: "provider", provider: "gemini", model: "gemini-1.5-pro", latencyMs: 5 },
      "id-6",
    );
    expect(record.agent).toBe("gemini");
    expect(record.sessionId).toBeNull();
    expect(record.taskId).toBeNull();
    expect(record.taskRef).toBeNull();
    expect(record.requestCount).toBe(1);
  });
});

describe("estimateTokens — documented heuristic", () => {
  it("uses ~4 characters per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("withUsageTracking", () => {
  it("records a provider call at the port boundary and returns the response", async () => {
    const usage = createTestUsage();
    const usageData: TokenUsage = { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 };
    const wrapped = withUsageTracking(fakeProvider({ content: "hello" }, usageData), usage, {
      agent: "codex",
    });
    const result = await wrapped.complete({ prompt: "hi" });
    expect(result.ok).toBe(true);

    const records = usage.listUsage();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      provider: "claude",
      model: "claude-sonnet-5",
      agent: "codex",
      source: "provider",
    });
    expect(records[0].tokens.total).toEqual({ source: "actual", value: 1500 });
    expect(records[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("records unknown tokens when the provider reports none (not a guess)", async () => {
    const usage = createTestUsage();
    const wrapped = withUsageTracking(fakeProvider({ content: "ok" }, undefined), usage);
    await wrapped.complete({ prompt: "hi" });
    const record = usage.listUsage()[0];
    expect(record.tokens.input.source).toBe("unknown");
    expect(record.cost.amount.source).toBe("unknown");
    expect(record.cost.amount.value).toBeNull();
  });

  it("estimates tokens only when explicitly enabled", async () => {
    const usage = createTestUsage();
    const wrapped = withUsageTracking(fakeProvider({ content: "world" }, undefined), usage, {
      estimateTokens: true,
    });
    await wrapped.complete({ prompt: "hello" });
    const record = usage.listUsage()[0];
    expect(record.tokens.input).toMatchObject({ source: "estimated", value: 2 });
    expect(record.tokens.output).toMatchObject({ source: "estimated", value: 2 });
    expect(record.tokens.total).toMatchObject({ source: "estimated", value: 4 });
  });

  it("does not store prompt text in the record", async () => {
    const usage = createTestUsage();
    const wrapped = withUsageTracking(
      fakeProvider({ content: "ok" }, { inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
      usage,
    );
    await wrapped.complete({ prompt: "SUPER-SECRET-PROMPT" });
    expect(JSON.stringify(usage.listUsage())).not.toContain("SUPER-SECRET-PROMPT");
  });

  it("records errors only when recordOnError is set", async () => {
    const usage = createTestUsage();
    const failing: ProviderPort = {
      async complete() {
        return { ok: false, error: new Error("boom") };
      },
    };
    const wrapped = withUsageTracking(failing, usage, {
      recordOnError: true,
      defaultProvider: "openai",
    });
    await wrapped.complete({ prompt: "hi", provider: "openai", model: "gpt-4o" });
    const record = usage.listUsage()[0];
    expect(record).toMatchObject({ provider: "openai", model: "gpt-4o" });
    expect(record.tokens.total.source).toBe("unknown");
  });
});

describe("trackAgentRun", () => {
  it("records an agent run as a session event with unknown tokens", async () => {
    const usage = createTestUsage();
    const result: AgentRunResult = {
      provider: "claude",
      command: "/usr/local/bin/claude",
      args: ["-p", "do the task"],
      prompt: "do the task",
      cwd: "/projects/codeatlas",
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "done",
      stderr: "",
      durationMs: 1234,
    };
    const recorded = await trackAgentRun(usage, result, {
      sessionId: "s-1",
      taskId: "t-1",
      taskRef: "task-1 (hashed)",
      agent: "claude",
    });
    expect(recorded.ok).toBe(true);
    const record = usage.listUsage()[0];
    expect(record).toMatchObject({
      source: "session",
      provider: "claude",
      agent: "claude",
      sessionId: "s-1",
      taskId: "t-1",
      taskRef: "task-1 (hashed)",
      latencyMs: 1234,
      exitCode: 0,
      timedOut: false,
    });
    expect(record.model).toBeNull();
    expect(record.tokens.total.source).toBe("unknown");
    expect(record.cost.amount.source).toBe("unknown");
  });
});
