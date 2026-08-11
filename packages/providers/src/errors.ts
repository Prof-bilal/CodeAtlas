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
