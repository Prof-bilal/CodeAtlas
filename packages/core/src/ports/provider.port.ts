import type { Result } from "@atlas/shared";

/** Token counts for a single model call. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

/** Input for a single completion request to a language model. */
export interface ProviderRequest {
  /** Provider adapter to use (e.g. `"claude"`); defaults to the service default. */
  readonly provider?: string;
  /** Model id override for the adapter's configured default model. */
  readonly model?: string;
  readonly prompt: string;
  readonly system?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Ask the model to respond with structured JSON. */
  readonly json?: boolean;
}

/** A completion returned by a language model. */
export interface ProviderResponse {
  /** The adapter/provider that produced the response (e.g. `"claude"`). */
  readonly provider: string;
  readonly content: string;
  readonly model: string;
  readonly usage?: TokenUsage;
}

/** Unified adapter over AI model APIs so providers can be swapped freely. */
export interface ProviderPort {
  complete(request: ProviderRequest): Promise<Result<ProviderResponse>>;
}
