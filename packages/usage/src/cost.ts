import type {
  CostRecord,
  MeasuredQuantity,
  ModelPrice,
  QuantitySource,
  TokenUsageRecord,
} from "@atlas/core";

/**
 * Combine two provenance sources, "worst wins": `unknown` > `estimated` >
 * `actual`. Used wherever a derived quantity (e.g. cost) inherits uncertainty
 * from more than one input.
 */
export function combineSources(a: QuantitySource, b: QuantitySource): QuantitySource {
  if (a === "unknown" || b === "unknown") {
    return "unknown";
  }
  if (a === "estimated" || b === "estimated") {
    return "estimated";
  }
  return "actual";
}

/**
 * Compute the cost of a usage event from its tokens and the provider's price.
 *
 * Honest by construction — never a guess:
 * - no pricing data → `unknown`;
 * - unknown total tokens → `unknown`;
 * - unknown input/output split → `unknown`;
 * - otherwise `input/1e6 × inputPerMillion + output/1e6 × outputPerMillion`,
 *   with the confidence being the *worst* of the token and price sources.
 */
export function computeCost(tokens: TokenUsageRecord, price: ModelPrice | undefined): CostRecord {
  if (price === undefined) {
    return {
      currency: null,
      amount: {
        source: "unknown",
        value: null,
        note: "no pricing data for this provider/model",
      },
    };
  }
  if (tokens.total.value === null) {
    return {
      currency: price.currency,
      amount: { source: "unknown", value: null, note: "token count unknown" },
    };
  }
  if (tokens.input.value === null || tokens.output.value === null) {
    return {
      currency: price.currency,
      amount: { source: "unknown", value: null, note: "input/output token split unknown" },
    };
  }
  if (price.inputPerMillion.value === null || price.outputPerMillion.value === null) {
    return {
      currency: price.currency,
      amount: { source: "unknown", value: null, note: "price per token unknown" },
    };
  }

  const inputCost = (tokens.input.value / 1_000_000) * price.inputPerMillion.value;
  const outputCost = (tokens.output.value / 1_000_000) * price.outputPerMillion.value;
  const source = combineSources(
    tokens.total.source,
    combineSources(price.inputPerMillion.source, price.outputPerMillion.source),
  );
  const amount: MeasuredQuantity = {
    source,
    value: roundCost(inputCost + outputCost),
    ...(source === "actual"
      ? {}
      : {
          note:
            source === "estimated"
              ? "derived from estimated token counts or pricing"
              : "cost cannot be determined",
        }),
  };
  return { currency: price.currency, amount };
}

/** Round a cost to 6 decimal places (sub-cent precision is meaningless). */
function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
