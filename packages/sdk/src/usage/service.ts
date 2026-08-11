import type { PricingSource, UsagePort } from "@atlas/core";
import { StaticPricingSource, UsageService, UsageStore } from "@atlas/usage";

/** Options for {@link createUsageService}. */
export interface CreateUsageServiceOptions {
  /**
   * Path of the dedicated usage database (`.codeatlas/usage.db`). Defaults to
   * `":memory:"` — the store is separate from the context database.
   */
  readonly filePath?: string;
  /** Inject a usage store (e.g. a temp-file store) for tests. */
  readonly store?: UsageStore;
  /** Provider pricing lookup; defaults to the built-in static table. */
  readonly pricing?: PricingSource;
}

/**
 * Create the Usage / Credits service (Task 18).
 *
 * The returned `UsagePort` records, aggregates, budgets, and enforces AI usage
 * with the tri-state actual/estimated/unknown provenance model. Pricing data
 * lives behind the injected {@link PricingSource} — never hardcoded in logic.
 */
export function createUsageService(options: CreateUsageServiceOptions = {}): UsagePort {
  const store = options.store ?? new UsageStore({ filePath: options.filePath ?? ":memory:" });
  return new UsageService({
    store,
    pricing: options.pricing ?? new StaticPricingSource(),
  });
}
