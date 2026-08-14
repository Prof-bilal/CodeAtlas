import type { ProviderPort, ProviderRequest, ProviderResponse } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail } from "@atlas/shared";
import type { ProviderAdapter, ProviderConfig, ProviderName, ProviderStatus } from "./adapter";
import { ClaudeAdapter } from "./adapters/anthropic";
import { GeminiAdapter } from "./adapters/gemini";
import { OllamaAdapter } from "./adapters/ollama";
import { DeepSeekAdapter, OpenAIAdapter } from "./adapters/openai-compatible";
import { UnknownProviderError } from "./errors";
import { fetchTransport } from "./transport";
import type { HttpTransport } from "./transport";

/** Options for constructing a {@link ProviderService}. */
export interface ProviderServiceOptions {
  /** HTTP transport; defaults to global `fetch`. Inject a fake for tests. */
  readonly transport?: HttpTransport;
  /** Adapter used when `ProviderRequest.provider` is omitted. Default `"claude"`. */
  readonly defaultProvider?: string;
  /** Configs for the built-in providers; only configured ones are registered. */
  readonly providers?: Partial<Record<ProviderName, ProviderConfig>>;
}

/** An adapter that can also list its available models (e.g. Ollama). */
export interface ModelListingAdapter {
  listModels(): Promise<Result<readonly string[]>>;
}

/**
 * Unified adapter over AI model APIs, behind the `ProviderPort` contract.
 *
 * Built-in providers (Claude, OpenAI, Gemini, DeepSeek, Ollama) are registered
 * from the constructor config; new providers are added by implementing {@link
 * ProviderAdapter} and calling {@link register}.
 */
export class ProviderService implements ProviderPort {
  private readonly adapters = new Map<string, ProviderAdapter>();
  private readonly keyed = new Map<string, boolean>();
  private readonly transport: HttpTransport;
  private readonly defaultProvider: string;

  public constructor(options: ProviderServiceOptions = {}) {
    this.transport = options.transport ?? fetchTransport;
    this.defaultProvider = options.defaultProvider ?? "claude";
    const providers = options.providers ?? {};
    if (providers.claude !== undefined) {
      this.register(new ClaudeAdapter(providers.claude, this.transport), true);
    }
    if (providers.openai !== undefined) {
      this.register(new OpenAIAdapter(providers.openai, this.transport), true);
    }
    if (providers.gemini !== undefined) {
      this.register(new GeminiAdapter(providers.gemini, this.transport), true);
    }
    if (providers.deepseek !== undefined) {
      this.register(new DeepSeekAdapter(providers.deepseek, this.transport), true);
    }
    if (providers.ollama !== undefined) {
      this.register(
        new OllamaAdapter(providers.ollama, this.transport),
        providers.ollama.apiKey !== "",
      );
    }
  }

  /** Register an adapter by name; new providers can be added this way. */
  public register(adapter: ProviderAdapter, hasApiKey = false): this {
    this.adapters.set(adapter.name, adapter);
    this.keyed.set(adapter.name, hasApiKey);
    return this;
  }

  /** The currently registered provider ids. */
  public listProviders(): readonly string[] {
    return [...this.adapters.keys()];
  }

  /** The provider used when a request omits `provider`. */
  public get default(): string {
    return this.defaultProvider;
  }

  /** Per-provider status (configured, has key, active model) for `/providers`. */
  public status(): readonly ProviderStatus[] {
    const names: readonly string[] = ["claude", "openai", "gemini", "deepseek", "ollama"];
    return names.map((name) => {
      const adapter = this.adapters.get(name);
      if (adapter === undefined) {
        return { name, configured: false, hasApiKey: false, model: null, defaultModel: null };
      }
      return {
        name,
        configured: true,
        hasApiKey: this.requiresKey(name) ? (this.keyed.get(name) ?? false) : true,
        model: adapter.defaultModel,
        defaultModel: adapter.defaultModel,
      };
    });
  }

  /** Whether a provider can list its models (currently Ollama). */
  public isModelListing(name: string): boolean {
    const adapter = this.adapters.get(name);
    return adapter !== undefined && "listModels" in adapter;
  }

  /** List the models a provider exposes (e.g. Ollama); fails otherwise. */
  public async listModels(name: string): Promise<Result<readonly string[]>> {
    const adapter = this.adapters.get(name);
    if (adapter === undefined) {
      return fail(new UnknownProviderError(name));
    }
    if (!("listModels" in adapter)) {
      return fail(new Error(`Model listing is not supported by provider "${name}".`));
    }
    return (adapter as unknown as ModelListingAdapter).listModels();
  }

  public async complete(request: ProviderRequest): Promise<Result<ProviderResponse>> {
    const name = request.provider ?? this.defaultProvider;
    const adapter = this.adapters.get(name);
    if (adapter === undefined) {
      return fail(new UnknownProviderError(name));
    }
    return adapter.complete(request);
  }

  /** Providers that authenticate with an API key (Ollama may run locally). */
  private requiresKey(name: string): boolean {
    return name !== "ollama";
  }
}
