import type { UsageScope } from "@atlas/core";

/** Base class for usage-module errors. */
export class UsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** The pricing source does not know this provider/model. */
export class UnknownPriceError extends UsageError {
  public constructor(provider: string, model: string) {
    super(`No pricing data for ${provider}/${model}.`);
    this.name = "UnknownPriceError";
  }
}

/** A hard usage limit would be exceeded — the call must be denied (fail safe). */
export class UsageLimitExceededError extends UsageError {
  public readonly scope: UsageScope;
  public readonly reason: string;

  public constructor(scope: UsageScope, reason: string) {
    super(`Usage limit exceeded for ${scope.kind} "${scope.value}": ${reason}`);
    this.name = "UsageLimitExceededError";
    this.scope = scope;
    this.reason = reason;
  }
}
