import type { ProviderRequest, ProviderResponse } from "@atlas/core";
import type { Result } from "@atlas/shared";

/** The built-in provider ids. */
export type ProviderName = "claude" | "openai" | "gemini" | "deepseek" | "ollama";

/** Static configuration for a provider adapter. */
export interface ProviderConfig {
  /** API key for the provider. */
  readonly apiKey: string;
  /** Default model id, overridable per request via `ProviderRequest.model`. */
  readonly model?: string;
  /** Override the provider's default base URL. */
  readonly baseUrl?: string;
}

/**
 * Reported status for one configured provider. Deliberately excludes the API
 * key — callers render `hasApiKey` and never the secret itself.
 */
export interface ProviderStatus {
  readonly name: string;
  /** True when an adapter is registered for this provider. */
  readonly configured: boolean;
  /** True when the provider requires a key and one is present. */
  readonly hasApiKey: boolean;
  /** The active model (configured default, or `null` when not configured). */
  readonly model: string | null;
  /** The adapter's default model when no explicit model is configured. */
  readonly defaultModel: string | null;
}

/**
 * A single provider adapter behind the `ProviderPort` contract.
 *
 * New providers implement this interface and are registered with
 * {@link ProviderService.register}.
 */
export interface ProviderAdapter {
  /** Lowercased id, e.g. `"claude"`. */
  readonly name: string;
  /** Default model id used when the request does not specify one. */
  readonly defaultModel: string;
  complete(request: ProviderRequest): Promise<Result<ProviderResponse>>;
}
