import type { ProviderResponse } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import type { ProviderAdapter } from "../src/adapter";
import { ProviderNetworkError, ProviderRequestError, UnknownProviderError } from "../src/errors";
import { ProviderService } from "../src/provider.service";
import type { HttpTransport } from "../src/transport";
import { createFakeTransport } from "./helpers";

/** A transport that never answers — simulates offline/DNS/connection errors. */
const offlineTransport: HttpTransport = {
  async post() {
    throw new Error("ECONNREFUSED: connection refused");
  },
  async get() {
    throw new Error("ECONNREFUSED: connection refused");
  },
};

describe("ProviderService", () => {
  it("registers configured built-in providers and routes by name", async () => {
    const fake = createFakeTransport([
      {
        status: 200,
        json: { choices: [{ message: { content: "openai says hi" } }], model: "gpt-4o" },
      },
    ]);
    const service = new ProviderService({
      transport: fake.transport,
      providers: { claude: { apiKey: "c" }, openai: { apiKey: "o" } },
    });
    expect(service.listProviders()).toEqual(["claude", "openai"]);

    // Default provider (claude) responds to the fake transport.
    const claude = await service.complete({ prompt: "hi" });
    expect(claude.ok).toBe(true);
    if (!claude.ok) {
      return;
    }
    expect(claude.value.model).toBe("gpt-4o");

    const openai = await service.complete({ provider: "openai", prompt: "hi" });
    expect(openai.ok).toBe(true);
  });

  it("fails with UnknownProviderError when the provider is not configured", async () => {
    const service = new ProviderService({ transport: createFakeTransport([]).transport });
    const result = await service.complete({ prompt: "hi" });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(UnknownProviderError);
  });

  it("registers custom adapters to add new providers", async () => {
    const service = new ProviderService({ transport: createFakeTransport([]).transport });
    const echo: ProviderAdapter = {
      name: "echo",
      defaultModel: "echo-1",
      async complete(request): Promise<Result<ProviderResponse>> {
        return ok({ provider: "echo", content: `echo:${request.prompt}`, model: "echo-1" });
      },
    };
    service.register(echo);
    expect(service.listProviders()).toContain("echo");

    const result = await service.complete({ provider: "echo", prompt: "hello" });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.content).toBe("echo:hello");
  });

  it("exposes per-provider status with hasApiKey tracking", () => {
    const fake = createFakeTransport([]);
    const service = new ProviderService({
      transport: fake.transport,
      providers: { openai: { apiKey: "o" } },
    });
    service.register({
      name: "ollama",
      defaultModel: "llama3.2",
      async complete() {
        return ok({ provider: "ollama", content: "", model: "llama3.2" });
      },
    });

    const statuses = service.status();
    const openai = statuses.find((status) => status.name === "openai");
    expect(openai).toEqual({
      name: "openai",
      configured: true,
      hasApiKey: true,
      model: "gpt-4o",
      defaultModel: "gpt-4o",
    });
    const ollama = statuses.find((status) => status.name === "ollama");
    expect(ollama?.configured).toBe(true);
    expect(ollama?.hasApiKey).toBe(true);
    expect(ollama?.defaultModel).toBe("llama3.2");
  });

  it("fails with ProviderNetworkError when the transport rejects (all adapters)", async () => {
    const service = new ProviderService({
      transport: offlineTransport,
      providers: {
        claude: { apiKey: "c" },
        openai: { apiKey: "o" },
        gemini: { apiKey: "g" },
        deepseek: { apiKey: "d" },
        ollama: { apiKey: "" },
      },
    });

    for (const provider of ["claude", "openai", "gemini", "deepseek", "ollama"]) {
      const result = await service.complete({ provider, prompt: "hi" });
      expect(result.ok, `${provider} should fail cleanly`).toBe(false);
      if (result.ok) {
        continue;
      }
      // A transport-level failure must surface as a typed failure, not an
      // unhandled rejection.
      expect(result.error).toBeInstanceOf(ProviderNetworkError);
    }
  });

  it("fails with ProviderNetworkError when the transport rejects (ollama listModels)", async () => {
    const service = new ProviderService({
      transport: offlineTransport,
      providers: { ollama: { apiKey: "" } },
    });
    const result = await service.listModels("ollama");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(ProviderNetworkError);
  });

  it("still surfaces a typed ProviderRequestError on a non-2xx response", async () => {
    const fake = createFakeTransport([{ status: 500, json: { error: "boom" } }]);
    const service = new ProviderService({
      transport: fake.transport,
      providers: { claude: { apiKey: "c" } },
    });
    const result = await service.complete({ prompt: "hi" });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(ProviderRequestError);
    expect(result.error.message).toContain("500");
  });
});
