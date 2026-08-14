import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadUserSettings,
  maskApiKey,
  readApiKey,
  readProviderConfigs,
  removeUserSettings,
  saveUserSettings,
} from "../src/config";

describe("provider config", () => {
  it("reads keys from env, preferring the CodeAtlas variable name", () => {
    const env = {
      CLAUDE_API_KEY: "claude-key",
      ANTHROPIC_API_KEY: "anthropic-key",
      GEMINI_API_KEY: "gemini-key",
    };
    expect(readApiKey(env, "claude")).toBe("claude-key");
    expect(readApiKey(env, "gemini")).toBe("gemini-key");
    expect(readApiKey(env, "openai")).toBeUndefined();
    expect(readApiKey({}, "claude")).toBeUndefined();
    expect(readApiKey({ CLAUDE_API_KEY: "" }, "claude")).toBeUndefined();
  });

  it("builds provider configs with Ollama always present (local default)", () => {
    const configs = readProviderConfigs({ OLLAMA_BASE_URL: "http://127.0.0.1:11434" }, [
      "ollama",
      "openai",
      "claude",
    ]);
    expect(configs.ollama).toEqual({
      apiKey: "",
      baseUrl: "http://127.0.0.1:11434",
    });
    expect(configs.openai).toBeUndefined();
    expect(configs.claude).toBeUndefined();
  });

  it("keeps the Ollama key when the env provides one (cloud mode)", () => {
    const configs = readProviderConfigs({ OLLAMA_API_KEY: "cloud-key" }, ["ollama"]);
    expect(configs.ollama).toEqual({ apiKey: "cloud-key" });
  });

  it("masks API keys for display", () => {
    expect(maskApiKey("")).toBe("");
    expect(maskApiKey("abcd")).toBe("••••");
    expect(maskApiKey("sk-abcdefgh1234567890")).toBe("••••••••••••7890");
  });

  it("round-trips user settings and creates the file with 0600 permissions", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-providers-"));
    const filePath = join(dir, "providers.json");
    try {
      saveUserSettings({ activeProvider: "ollama", ollama: { mode: "local" } }, filePath);
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
        activeProvider: string;
      };
      expect(parsed.activeProvider).toBe("ollama");
      if (process.platform !== "win32") {
        expect(statSync(filePath).mode & 0o777).toBe(0o600);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("removes the settings file", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-providers-"));
    const filePath = join(dir, "providers.json");
    try {
      saveUserSettings({}, filePath);
      removeUserSettings(filePath);
      expect(() => readFileSync(filePath, "utf8")).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns empty settings for a missing or corrupt file", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-providers-"));
    try {
      const missing = join(dir, "missing.json");
      expect(loadUserSettings(missing)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
