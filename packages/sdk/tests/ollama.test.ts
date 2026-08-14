import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HttpResponse, HttpTransport } from "@atlas/providers";
import { describe, expect, it } from "vitest";
import { createOllamaService } from "../src/providers/ollama";

function fakeTransport(responses: readonly HttpResponse[]): {
  transport: HttpTransport;
  calls: { url: string }[];
} {
  const calls: { url: string }[] = [];
  let index = 0;
  const next = (): HttpResponse =>
    responses[Math.min(index++, responses.length - 1)] ?? { status: 200, json: {} };
  return {
    transport: {
      async post(url) {
        calls.push({ url });
        return next();
      },
      async get(url) {
        calls.push({ url });
        return next();
      },
    },
    calls,
  };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "atlas-ollama-"));
}

describe("createOllamaService", () => {
  it("reports an unconnected local default before any connect", () => {
    const dir = tempDir();
    try {
      const service = createOllamaService({ configPath: join(dir, "providers.json") });
      expect(service.status()).toEqual({
        connected: false,
        mode: "local",
        baseUrl: "http://localhost:11434",
        hasApiKey: false,
        keyDisplay: "",
        model: null,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("connects to a local server, persisting settings without a key", async () => {
    const dir = tempDir();
    const configPath = join(dir, "providers.json");
    try {
      const { transport, calls } = fakeTransport([
        { status: 200, json: { models: [{ name: "llama3.2" }] } },
      ]);
      const service = createOllamaService({ configPath, transport });
      const result = await service.connect();
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.models).toEqual(["llama3.2"]);
      expect(result.value.status.connected).toBe(true);
      expect(result.value.status.mode).toBe("local");
      expect(calls.map((call) => call.url)).toEqual(["http://localhost:11434/api/tags"]);

      const persisted = JSON.parse(readFileSync(configPath, "utf8")) as {
        ollama: { mode: string };
        activeProvider: string;
      };
      expect(persisted.activeProvider).toBe("ollama");
      expect(persisted.ollama.mode).toBe("local");
      expect(persisted.ollama).not.toHaveProperty("apiKey");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("connects in cloud mode and saves the key only when opted in", async () => {
    const dir = tempDir();
    const configPath = join(dir, "providers.json");
    try {
      const noSave = fakeTransport([{ status: 200, json: { models: [{ name: "gpt-oss" }] } }]);
      const service = createOllamaService({ configPath, transport: noSave.transport });
      const result = await service.connect({
        apiKey: "ollama-cloud-key",
        baseUrl: "https://ollama.example.com",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.status.mode).toBe("cloud");
      expect(result.value.status.hasApiKey).toBe(true);
      expect(result.value.status.keyDisplay).not.toContain("ollama-cloud-key");
      expect(JSON.parse(readFileSync(configPath, "utf8"))).not.toHaveProperty(["ollama", "apiKey"]);

      const withSave = fakeTransport([{ status: 200, json: { models: [] } }]);
      const service2 = createOllamaService({ configPath, transport: withSave.transport });
      await service2.connect({ apiKey: "ollama-cloud-key", saveKey: true });
      const persisted = JSON.parse(readFileSync(configPath, "utf8")) as {
        ollama: { apiKey: string };
      };
      expect(persisted.ollama.apiKey).toBe("ollama-cloud-key");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a connect when the server is unreachable", async () => {
    const dir = tempDir();
    try {
      const { transport } = fakeTransport([{ status: 500, json: { error: "down" } }]);
      const service = createOllamaService({ configPath: join(dir, "providers.json"), transport });
      const result = await service.connect();
      expect(result.ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("disconnects by removing the settings", async () => {
    const dir = tempDir();
    const configPath = join(dir, "providers.json");
    try {
      const { transport } = fakeTransport([{ status: 200, json: { models: [] } }]);
      const service = createOllamaService({ configPath, transport });
      await service.connect();
      expect(service.status().connected).toBe(true);
      service.disconnect();
      expect(service.status().connected).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the env key for cloud mode when nothing is persisted", () => {
    const dir = tempDir();
    try {
      const service = createOllamaService({
        configPath: join(dir, "providers.json"),
        env: {
          OLLAMA_API_KEY: "env-key",
          OLLAMA_BASE_URL: "http://127.0.0.1:9999",
        } as NodeJS.ProcessEnv,
      });
      const status = service.status();
      expect(status.mode).toBe("cloud");
      expect(status.hasApiKey).toBe(true);
      expect(status.keyDisplay).not.toContain("env-key");
      expect(status.baseUrl).toBe("http://127.0.0.1:9999");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("selects and persists a model with use()", async () => {
    const dir = tempDir();
    const configPath = join(dir, "providers.json");
    try {
      const service = createOllamaService({ configPath });
      const status = service.use("qwen3");
      expect(status.model).toBe("qwen3");
      const persisted = JSON.parse(readFileSync(configPath, "utf8")) as {
        activeModel: string;
        ollama: { model: string };
      };
      expect(persisted.activeModel).toBe("qwen3");
      expect(persisted.ollama.model).toBe("qwen3");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lists the provider overview from createProviderService config", () => {
    const dir = tempDir();
    const configPath = join(dir, "providers.json");
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(configPath, JSON.stringify({ activeProvider: "ollama" }), "utf8");
      const service = createOllamaService({ configPath });
      const overview = service.overview();
      expect(overview.defaultProvider).toBe("ollama");
      expect(overview.providers.map((provider) => provider.name)).toContain("ollama");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
