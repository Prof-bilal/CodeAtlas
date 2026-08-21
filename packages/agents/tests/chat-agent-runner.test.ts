import type { ProviderPort, ProviderResponse } from "@atlas/core";
import { fail, ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { ProviderChatAgent } from "../src/chat-agent-runner";

function fakeProvider(response?: ProviderResponse): ProviderPort {
  return {
    complete: async () => {
      return ok(
        response ?? {
          provider: "ollama",
          content: "Hello world",
          model: "llama3.2",
          usage: undefined,
          toolCalls: undefined,
        },
      );
    },
  };
}

function failingProvider(errorMessage: string): ProviderPort {
  return {
    complete: async () => {
      return fail(new Error(errorMessage));
    },
  };
}

describe("ProviderChatAgent", () => {
  it("returns the provider's reply content and model", async () => {
    const provider = fakeProvider();
    const agent = new ProviderChatAgent(provider, ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "What is 2+2?",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe("Hello world");
      expect(result.value.model).toBe("llama3.2");
      expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns error when provider fails", async () => {
    const agent = new ProviderChatAgent(failingProvider("connection refused"), ["ollama"]);

    const result = await agent.run({
      provider: "ollama",
      prompt: "test",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(false);
  });

  it("rejects unknown providers", async () => {
    const agent = new ProviderChatAgent(fakeProvider(), ["ollama"]);

    const result = await agent.run({
      provider: "claude",
      prompt: "test",
      repositoryPath: "/repo",
    });

    expect(result.ok).toBe(false);
  });

  it("handles() returns true for configured providers", () => {
    const agent = new ProviderChatAgent(fakeProvider(), ["ollama"]);
    expect(agent.handles("ollama")).toBe(true);
    expect(agent.handles("claude")).toBe(false);
  });

  it("reports providers list", () => {
    const agent = new ProviderChatAgent(fakeProvider(), ["ollama"]);
    expect(agent.providers).toEqual(["ollama"]);
  });
});
