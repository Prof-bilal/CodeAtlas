/** Thrown (as a `Result` failure) when no adapter is registered for a provider. */
export class UnknownProviderError extends Error {
  public readonly provider: string;

  public constructor(provider: string) {
    super(`No provider adapter is registered for "${provider}".`);
    this.name = "UnknownProviderError";
    this.provider = provider;
  }
}

/** Thrown (as a `Result` failure) when a provider API returns a non-2xx status. */
export class ProviderRequestError extends Error {
  public readonly provider: string;
  public readonly status: number;
  public readonly body: unknown;

  public constructor(provider: string, status: number, body: unknown) {
    super(`Provider "${provider}" returned HTTP ${status}.`);
    this.name = "ProviderRequestError";
    this.provider = provider;
    this.status = status;
    this.body = body;
  }
}

/**
 * Thrown (as a `Result` failure) when the provider transport cannot reach the
 * API at all (offline, DNS failure, connection refused, timeout, …) — i.e. no
 * HTTP response was received. Kept distinct from {@link ProviderRequestError}
 * so callers can distinguish "the API answered with an error" from "the API
 * never answered".
 */
export class ProviderNetworkError extends Error {
  public readonly provider: string;
  public override readonly cause: unknown;

  public constructor(provider: string, cause: unknown) {
    super(
      `Provider "${provider}" request failed before a response: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "ProviderNetworkError";
    this.provider = provider;
    this.cause = cause;
  }
}
