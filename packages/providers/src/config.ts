import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ProviderConfig, ProviderName } from "./adapter";

/**
 * Env-var names for each built-in provider's API key. `ANTHROPIC_API_KEY` is
 * accepted as a synonym for `CLAUDE_API_KEY` (the provider's own convention).
 */
export const API_KEY_ENV: Record<ProviderName, readonly string[]> = {
  claude: ["CLAUDE_API_KEY", "ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  ollama: ["OLLAMA_API_KEY"],
};

export const BASE_URL_ENV: Partial<Record<ProviderName, string>> = {
  ollama: "OLLAMA_BASE_URL",
};

/**
 * Read the API key for one provider from an env map. Returns `undefined` when
 * no key is present; never throws on missing variables.
 */
export function readApiKey(env: NodeJS.ProcessEnv, provider: ProviderName): string | undefined {
  for (const name of API_KEY_ENV[provider]) {
    const value = env[name];
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
}

/** Read every provider key present in an env map (for `createProviderService`). */
export function readApiKeys(env: NodeJS.ProcessEnv): Partial<Record<ProviderName, string>> {
  const keys: Partial<Record<ProviderName, string>> = {};
  for (const provider of Object.keys(API_KEY_ENV) as readonly ProviderName[]) {
    const key = readApiKey(env, provider);
    if (key !== undefined) {
      keys[provider] = key;
    }
  }
  return keys;
}

/**
 * Build `ProviderConfig` entries from an env map for the given providers.
 * Ollama gets `apiKey: ""` when no key is set (local mode) so it is always
 * available; keyed providers are only included when a key exists.
 */
export function readProviderConfigs(
  env: NodeJS.ProcessEnv,
  providers: readonly ProviderName[],
): Partial<Record<ProviderName, ProviderConfig>> {
  const configs: Partial<Record<ProviderName, ProviderConfig>> = {};
  for (const provider of providers) {
    if (provider === "ollama") {
      configs.ollama = {
        apiKey: readApiKey(env, "ollama") ?? "",
        ...(env["OLLAMA_BASE_URL"] !== undefined && env["OLLAMA_BASE_URL"] !== ""
          ? { baseUrl: env["OLLAMA_BASE_URL"] }
          : {}),
      };
      continue;
    }
    const key = readApiKey(env, provider);
    if (key !== undefined) {
      configs[provider] = { apiKey: key };
    }
  }
  return configs;
}

/** Mask an API key for display: keep the last four characters, hide the rest. */
export function maskApiKey(key: string): string {
  if (key === "") {
    return "";
  }
  if (key.length <= 4) {
    return "••••";
  }
  return `${"•".repeat(Math.min(12, key.length - 4))}${key.slice(-4)}`;
}

/** File path of the user-scoped provider settings (defaults to `~/.codeatlas/providers.json`). */
export function defaultUserConfigPath(): string {
  return join(homedir(), ".codeatlas", "providers.json");
}

/** Persistent, user-scoped provider settings. Holds no secrets by default. */
export interface UserProviderSettings {
  /** Provider id used when a request omits one (e.g. `"ollama"`). */
  readonly activeProvider?: string;
  /** Model used when a request omits one. */
  readonly activeModel?: string;
  readonly ollama?: {
    /** `"local"` (localhost, no key) or `"cloud"` (user API key). */
    readonly mode: "local" | "cloud";
    readonly baseUrl?: string;
    /** Stored **only** when the user opts in to saving the key. */
    readonly apiKey?: string;
    readonly model?: string;
  };
}

/** Load user settings; missing/corrupt files yield empty settings. */
export function loadUserSettings(filePath = defaultUserConfigPath()): UserProviderSettings {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    return parsed as UserProviderSettings;
  } catch {
    return {};
  }
}

/** Persist user settings, creating the directory; write permission 0600. */
export function saveUserSettings(
  settings: UserProviderSettings,
  filePath = defaultUserConfigPath(),
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

/** Remove the settings file (used by `disconnect`). */
export function removeUserSettings(filePath = defaultUserConfigPath()): void {
  try {
    rmSync(filePath, { force: true });
  } catch {
    // Best-effort: nothing to clean up.
  }
}
