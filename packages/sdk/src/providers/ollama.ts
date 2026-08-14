import {
  type HttpTransport,
  OllamaAdapter,
  type ProviderService,
  type ProviderStatus,
  defaultUserConfigPath,
  fetchTransport,
  loadUserSettings,
  maskApiKey,
  removeUserSettings,
  saveUserSettings,
} from "@atlas/providers";
import type { Result } from "@atlas/shared";
import { createProviderService } from "./service";

/** Options for {@link createOllamaService}. */
export interface CreateOllamaServiceOptions {
  /** Env map to read `OLLAMA_API_KEY` from; defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** User settings file path; defaults to `~/.codeatlas/providers.json`. */
  readonly configPath?: string;
  /** HTTP transport (inject a fake in tests). */
  readonly transport?: HttpTransport;
}

/** Reported Ollama connection state. Never includes the raw API key. */
export interface OllamaStatus {
  readonly connected: boolean;
  readonly mode: "local" | "cloud";
  readonly baseUrl: string;
  /** True when a key is configured (env, persisted, or passed in memory). */
  readonly hasApiKey: boolean;
  /** Masked key for display (e.g. `••••abcd`); empty when no key. */
  readonly keyDisplay: string;
  /** The active model id, or `null` when none selected. */
  readonly model: string | null;
}

/** Result of {@link OllamaService.connect}. */
export interface OllamaConnectResult {
  readonly status: OllamaStatus;
  /** Model ids exposed by the server after a successful connection test. */
  readonly models: readonly string[];
}

/** Unified AI-provider overview for `/providers`. */
export interface ProviderOverview {
  readonly providers: readonly ProviderStatus[];
  readonly defaultProvider: string;
  readonly defaultModel: string | null;
}

/** What `/ollama connect` accepts. */
export interface OllamaConnectRequest {
  /** Cloud API key. Omit (or pass `""`) for a local server (no auth). */
  readonly apiKey?: string;
  /** Base URL override; defaults to `http://localhost:11434`. */
  readonly baseUrl?: string;
  /** Persist the key in the user settings file (chmod 0600). Default `false`. */
  readonly saveKey?: boolean;
}

/**
 * The `/ollama` + `/providers` service: connect/disconnect, model listing and
 * selection, and per-provider status. Keys are masked everywhere they can be
 * displayed and are only persisted on an explicit `saveKey` opt-in.
 */
export interface OllamaService {
  status(): OllamaStatus;
  connect(request?: OllamaConnectRequest): Promise<Result<OllamaConnectResult>>;
  disconnect(): void;
  listModels(): Promise<Result<readonly string[]>>;
  use(model: string): OllamaStatus;
  overview(): ProviderOverview;
}

/**
 * Compose the Ollama + provider-status service.
 */
export function createOllamaService(options: CreateOllamaServiceOptions = {}): OllamaService {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? defaultUserConfigPath();
  const transport = options.transport ?? fetchTransport;

  function settings() {
    return loadUserSettings(configPath);
  }

  function baseUrlOf(): string {
    return (
      settings().ollama?.baseUrl ??
      (env["OLLAMA_BASE_URL"] !== undefined && env["OLLAMA_BASE_URL"] !== ""
        ? env["OLLAMA_BASE_URL"]
        : "http://localhost:11434")
    );
  }

  function keyOf(request?: OllamaConnectRequest): string | undefined {
    if (request?.apiKey !== undefined && request.apiKey !== "") {
      return request.apiKey;
    }
    const persisted = settings().ollama?.apiKey;
    if (persisted !== undefined && persisted !== "") {
      return persisted;
    }
    const fromEnv = env["OLLAMA_API_KEY"];
    return fromEnv !== undefined && fromEnv !== "" ? fromEnv : undefined;
  }

  function adapter(request?: OllamaConnectRequest): OllamaAdapter {
    return new OllamaAdapter(
      { apiKey: keyOf(request) ?? "", baseUrl: request?.baseUrl ?? baseUrlOf() },
      transport,
    );
  }

  function status(): OllamaStatus {
    const persisted = settings().ollama;
    const key = keyOf();
    const mode: "local" | "cloud" = persisted?.mode ?? (key !== undefined ? "cloud" : "local");
    return {
      connected: persisted !== undefined,
      mode,
      baseUrl: baseUrlOf(),
      hasApiKey: key !== undefined,
      keyDisplay: key === undefined ? "" : maskApiKey(key),
      model: persisted?.model ?? null,
    };
  }

  async function connect(request: OllamaConnectRequest = {}): Promise<Result<OllamaConnectResult>> {
    const a = adapter(request);
    const modelsResult = await a.listModels();
    if (!modelsResult.ok) {
      return { ok: false, error: modelsResult.error };
    }
    const key = keyOf(request);
    const next = settings();
    const ollama = {
      mode: (key !== undefined ? "cloud" : "local") as "local" | "cloud",
      baseUrl: request.baseUrl ?? baseUrlOf(),
      ...(key !== undefined && request.saveKey === true ? { apiKey: key } : {}),
      ...(next.ollama?.model !== undefined ? { model: next.ollama.model } : {}),
    };
    saveUserSettings({ ...next, ollama, activeProvider: "ollama" }, configPath);
    return {
      ok: true,
      value: {
        status: {
          connected: true,
          mode: ollama.mode,
          baseUrl: ollama.baseUrl,
          hasApiKey: key !== undefined,
          keyDisplay: key === undefined ? "" : maskApiKey(key),
          model: ollama.model ?? null,
        },
        models: modelsResult.value,
      },
    };
  }

  function disconnect(): void {
    const next = settings();
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) {
      if (k === "ollama" || v === undefined) {
        continue;
      }
      rest[k] = v;
    }
    if (Object.keys(rest).length === 0) {
      removeUserSettings(configPath);
      return;
    }
    saveUserSettings(rest as typeof next, configPath);
  }

  async function listModels(): Promise<Result<readonly string[]>> {
    return adapter().listModels();
  }

  function use(model: string): OllamaStatus {
    const key = keyOf();
    const next = settings();
    saveUserSettings(
      {
        ...next,
        activeProvider: "ollama",
        activeModel: model,
        ollama: {
          mode: (key !== undefined ? "cloud" : "local") as "local" | "cloud",
          baseUrl: baseUrlOf(),
          ...(next.ollama?.apiKey !== undefined ? { apiKey: next.ollama.apiKey } : {}),
          model,
        },
      },
      configPath,
    );
    return status();
  }

  function overview(): ProviderOverview {
    const service: ProviderService = createProviderService({ env, configPath, transport });
    const s = status();
    return {
      providers: service.status(),
      defaultProvider: service.default,
      defaultModel: s.connected ? (s.model ?? null) : null,
    };
  }

  return { status, connect, disconnect, listModels, use, overview };
}
