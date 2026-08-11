import type { ProviderPort, ProviderRequest, ProviderResponse } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail } from "@atlas/shared";
import type { ProviderAdapter, ProviderConfig, ProviderName } from "./adapter";
import { ClaudeAdapter } from "./adapters/anthropic";
import { GeminiAdapter } from "./adapters/gemini";
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

/**
 * Unified adapter over AI model APIs, behind the `ProviderPort` contract.
 *
 * Built-in providers (Claude, OpenAI, Gemini, DeepSeek) are registered from the
 * constructor config; new providers are added by implementing {@link
 * ProviderAdapter} and calling {@link register}.
 */
export class ProviderService implements ProviderPort {
  private readonly adapters = new Map<string, ProviderAdapter>();
  private readonly transport: HttpTransport;
  private readonly defaultProvider: string;

  public constructor(options: ProviderServiceOptions = {}) {
    this.transport = options.transport ?? fetchTransport;
    this.defaultProvider = options.defaultProvider ?? "claude";
    const providers = options.providers ?? {};
    if (providers.claude !== undefined) {
      this.register(new ClaudeAdapter(providers.claude, this.transport));
    }
    if (providers.openai !== undefined) {
      this.register(new OpenAIAdapter(providers.openai, this.transport));
    }
    if (providers.gemini !== undefined) {
      this.register(new GeminiAdapter(providers.gemini, this.transport));
    }
    if (providers.deepseek !== undefined) {
      this.register(new DeepSeekAdapter(providers.deepseek, this.transport));
    }
  }

  /** Register an adapter by name; new providers can be added this way. */
  public register(adapter: ProviderAdapter): this {
    this.adapters.set(adapter.name, adapter);
    return this;
  }

  /** The currently registered provider ids. */
  public listProviders(): readonly string[] {
    return [...this.adapters.keys()];
  }

  public async complete(request: ProviderRequest): Promise<Result<ProviderResponse>> {
    const name = request.provider ?? this.defaultProvider;
    const adapter = this.adapters.get(name);
    if (adapter === undefined) {
      return fail(new UnknownProviderError(name));
    }
    return adapter.complete(request);
  }
}
