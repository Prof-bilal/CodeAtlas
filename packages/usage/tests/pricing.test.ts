import { describe, expect, it } from "vitest";
import { StaticPricingSource, UnknownPriceError } from "../src";

describe("StaticPricingSource", () => {
  it("resolves built-in prices as estimated, not actual", async () => {
    const source = new StaticPricingSource();
    const result = await source.priceFor("claude", "claude-sonnet-5");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.currency).toBe("USD");
      expect(result.value.inputPerMillion).toMatchObject({ source: "estimated", value: 3 });
      expect(result.value.outputPerMillion).toMatchObject({ source: "estimated", value: 15 });
    }
  });

  it("fails with UnknownPriceError for an unknown model", async () => {
    const source = new StaticPricingSource();
    const result = await source.priceFor("claude", "claude-999");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(UnknownPriceError);
    }
  });

  it("accepts an injected custom table (data, not control flow)", async () => {
    const source = new StaticPricingSource({
      custom: {
        "custom-1": { currency: "EUR", inputPerMillion: 1.5, outputPerMillion: 6 },
      },
    });
    const result = await source.priceFor("custom", "custom-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.currency).toBe("EUR");
      expect(result.value.inputPerMillion.value).toBe(1.5);
    }
  });

  it("resolves arbitrary Ollama models through the provider wildcard at $0", async () => {
    const source = new StaticPricingSource();
    const result = await source.priceFor("ollama", "qwen2.5-coder:7b");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.inputPerMillion).toMatchObject({ source: "estimated", value: 0 });
      expect(result.value.outputPerMillion).toMatchObject({ source: "estimated", value: 0 });
      expect(result.value.inputPerMillion.note).toContain("local inference");
    }
  });

  it("prefers an exact model entry over the provider wildcard", async () => {
    const source = new StaticPricingSource({
      custom: {
        "custom-1": { currency: "USD", inputPerMillion: 2, outputPerMillion: 4 },
        "*": { currency: "USD", inputPerMillion: 0, outputPerMillion: 0 },
      },
    });
    const exact = await source.priceFor("custom", "custom-1");
    expect(exact.ok).toBe(true);
    if (exact.ok) {
      expect(exact.value.inputPerMillion.value).toBe(2);
    }
    const wildcard = await source.priceFor("custom", "anything-else");
    expect(wildcard.ok).toBe(true);
    if (wildcard.ok) {
      expect(wildcard.value.inputPerMillion.value).toBe(0);
    }
  });

  it("lists the providers it knows", () => {
    expect([...new StaticPricingSource().listProviders()].sort()).toEqual([
      "claude",
      "deepseek",
      "gemini",
      "ollama",
      "openai",
    ]);
  });
});
