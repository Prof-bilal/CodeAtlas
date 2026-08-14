import {
  type HttpTransport,
  type ProviderConfig,
  type ProviderName,
  ProviderService,
  type ProviderStatus,
  loadUserSettings,
  readProviderConfigs,
} from "@atlas/providers";

/** Options for {@link createProviderService}. */
export interface CreateProviderServiceOptions {
  /** Env map to read API keys from; defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** User settings file path; defaults to `~/.codeatlas/providers.json`. */
  readonly configPath?: string;
  /** HTTP transport (inject a fake in tests). */
  readonly transport?: HttpTransport;
}

/**
 * Build the shared {@link ProviderService}: adapters are registered from API
 * keys found in the environment plus the user's persisted Ollama connection.
 * No keys are written to the repository; the user-scoped settings file only
 * stores a key when the user opts in (`saveKey`).
 */
export function createProviderService(options: CreateProviderServiceOptions = {}): ProviderService {
  const env = options.env ?? process.env;
  const settings = loadUserSettings(options.configPath);
  const providers = readProviderConfigs(env, ["ollama", "claude", "openai", "gemini", "deepseek"]);
  const persisted = settings.ollama;
  if (persisted !== undefined) {
    providers.ollama = {
      apiKey: persisted.apiKey ?? providers.ollama?.apiKey ?? "",
      ...(persisted.model !== undefined ? { model: persisted.model } : {}),
      ...(persisted.baseUrl !== undefined ? { baseUrl: persisted.baseUrl } : {}),
    };
  }
  const defaultProvider = settings.activeProvider ?? "claude";
  return new ProviderService({
    providers,
    defaultProvider,
    ...(options.transport !== undefined ? { transport: options.transport } : {}),
  });
}

export type { ProviderConfig, ProviderName, ProviderStatus };
export { maskApiKey, readApiKeys } from "@atlas/providers";
