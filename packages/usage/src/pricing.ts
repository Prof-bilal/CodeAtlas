import type { ModelPrice, PricingSource } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import { UnknownPriceError } from "./errors";

/** A static per-1M-token price entry for one model. */
export interface StaticPriceEntry {
  readonly currency: string;
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
  /** Optional provenance note overriding the default (e.g. for $0 local inference). */
  readonly note?: string;
}

/**
 * The built-in price table. These are **published list prices — not verified**
 * (best-effort placeholders, matching the provider adapters' default model
 * ids). They are always returned with `source: "estimated"` so nothing is ever
 * presented as exact. Any model not listed yields `unknown`, never a guess.
 */
export const BUILTIN_PRICING: Readonly<Record<string, Readonly<Record<string, StaticPriceEntry>>>> =
  {
    claude: {
      "claude-sonnet-5": { currency: "USD", inputPerMillion: 3, outputPerMillion: 15 },
    },
    openai: {
      "gpt-5.6": { currency: "USD", inputPerMillion: 5, outputPerMillion: 30 },
      "gpt-4o": { currency: "USD", inputPerMillion: 2.5, outputPerMillion: 10 },
    },
    deepseek: {
      "deepseek-v4-flash": { currency: "USD", inputPerMillion: 0.14, outputPerMillion: 0.28 },
      "deepseek-chat": { currency: "USD", inputPerMillion: 0.27, outputPerMillion: 1.1 },
    },
    gemini: {
      "gemini-2.5-pro": { currency: "USD", inputPerMillion: 1.25, outputPerMillion: 10 },
      "gemini-1.5-pro": { currency: "USD", inputPerMillion: 1.25, outputPerMillion: 5 },
    },
    ollama: {
      // Local Ollama inference runs on the user's own machine — no per-token
      // cost. Cloud-hosted Ollama endpoints (API key set) do charge; their
      // prices are unknown here, so the note says so rather than guessing.
      "*": {
        currency: "USD",
        inputPerMillion: 0,
        outputPerMillion: 0,
        note: "local inference — no per-token cost; cloud-hosted endpoints may differ",
      },
    },
  };

const PRICE_NOTE = "published list price, not verified";

/**
 * A `PricingSource` backed by a static table. Pricing data lives **here** (the
 * data is data, not control flow) — the usage service consumes only the
 * {@link PricingSource} abstraction and never contains a provider `switch`.
 */
export class StaticPricingSource implements PricingSource {
  private readonly table: Readonly<Record<string, Readonly<Record<string, StaticPriceEntry>>>>;

  public constructor(
    table: Readonly<Record<string, Readonly<Record<string, StaticPriceEntry>>>> = BUILTIN_PRICING,
  ) {
    this.table = table;
  }

  public async priceFor(provider: string, model: string): Promise<Result<ModelPrice>> {
    // Exact model entry first; a provider-level `"*"` wildcard is the fallback
    // (used by Ollama, where model ids are arbitrary and locally hosted).
    const entry = this.table[provider]?.[model] ?? this.table[provider]?.["*"];
    if (entry === undefined) {
      return fail(new UnknownPriceError(provider, model));
    }
    const note = entry.note ?? PRICE_NOTE;
    return ok({
      provider,
      model,
      currency: entry.currency,
      inputPerMillion: { source: "estimated", value: entry.inputPerMillion, note },
      outputPerMillion: { source: "estimated", value: entry.outputPerMillion, note },
    });
  }

  public listProviders(): readonly string[] {
    return Object.keys(this.table);
  }
}
