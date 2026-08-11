import type { UsageScope } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { UsageLimitExceededError } from "../src";
import { createTestUsage } from "./helpers";

const agentScope: UsageScope = { kind: "agent", value: "claude" };
const userScope: UsageScope = { kind: "user", value: "me" };

describe("UsageService.record", () => {
  it("computes an estimated cost from actual tokens and estimated pricing", async () => {
    const usage = createTestUsage();
    const result = await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 10,
      inputTokens: 1_000,
      outputTokens: 2_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // (1000/1e6)*3 + (2000/1e6)*15 = 0.003 + 0.03
      expect(result.value.cost.currency).toBe("USD");
      expect(result.value.cost.amount.value).toBeCloseTo(0.033, 6);
      expect(result.value.cost.amount.source).toBe("estimated");
      expect(result.value.cost.amount.note).toContain("estimated");
    }
  });

  it("records unknown cost when the provider reports no tokens", async () => {
    const usage = createTestUsage();
    const result = await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 10,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cost.amount.source).toBe("unknown");
      expect(result.value.cost.amount.value).toBeNull();
    }
  });

  it("records unknown cost for a model with no price (never guessed)", async () => {
    const usage = createTestUsage();
    const result = await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-999",
      latencyMs: 10,
      inputTokens: 100,
      outputTokens: 100,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cost.amount.source).toBe("unknown");
      expect(result.value.cost.amount.value).toBeNull();
    }
  });
});

describe("UsageService reads", () => {
  it("round-trips a record via getUsage and listUsage", async () => {
    const usage = createTestUsage();
    const result = await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 10,
      inputTokens: 100,
      outputTokens: 200,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(usage.getUsage(result.value.id)).toEqual(result.value);
      expect(usage.listUsage()).toHaveLength(1);
    }
  });

  it("filters listUsage by provider, session, and time range", async () => {
    const usage = createTestUsage();
    await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 10,
      inputTokens: 1,
      outputTokens: 1,
      occurredAt: "2026-08-10T10:00:00.000Z",
    });
    await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 10,
      inputTokens: 1,
      outputTokens: 1,
      sessionId: "s-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
    });
    await usage.record({
      source: "provider",
      provider: "gemini",
      model: "gemini-1.5-pro",
      latencyMs: 10,
      inputTokens: 1,
      outputTokens: 1,
      occurredAt: "2026-08-12T10:00:00.000Z",
    });

    expect(usage.listUsage({ provider: "gemini" })).toHaveLength(1);
    expect(usage.listUsage({ sessionId: "s-1" })).toHaveLength(1);
    expect(usage.listUsage({ from: "2026-08-11T00:00:00.000Z" })).toHaveLength(2);
    expect(
      usage.listUsage({ from: "2026-08-11T00:00:00.000Z", to: "2026-08-11T23:59:59.999Z" }),
    ).toHaveLength(1);
  });
});

describe("UsageService.statistics", () => {
  it("aggregates tokens, cost, latency, byProvider, and byDay", async () => {
    const usage = createTestUsage();
    await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 100,
      inputTokens: 1000,
      outputTokens: 2000,
      occurredAt: "2026-08-11T10:00:00.000Z",
    });
    await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 200,
      inputTokens: 500,
      outputTokens: 500,
      occurredAt: "2026-08-11T11:00:00.000Z",
    });
    await usage.record({
      source: "provider",
      provider: "gemini",
      model: "gemini-1.5-pro",
      latencyMs: 300,
      inputTokens: 100,
      outputTokens: 100,
      occurredAt: "2026-08-12T10:00:00.000Z",
    });

    const stats = usage.statistics();
    expect(stats.events).toBe(3);
    expect(stats.requests).toBe(3);
    expect(stats.tokens.total).toMatchObject({ source: "actual", value: 4200 });
    expect(stats.latency.samples).toBe(3);
    expect(stats.latency.avgMs.value).toBe(200);
    expect(stats.latency.maxMs.value).toBe(300);
    expect(Object.keys(stats.byProvider).sort()).toEqual(["claude", "gemini"]);
    expect(stats.byProvider["claude"].tokens.total.value).toBe(4000);
    expect(Object.keys(stats.byDay).sort()).toEqual(["2026-08-11", "2026-08-12"]);
  });
});

describe("UsageService budgets (soft targets)", () => {
  it("reports consumption and percentages against a budget", async () => {
    const usage = createTestUsage();
    await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 1,
      inputTokens: 400,
      outputTokens: 600,
    });
    usage.setBudget({ scope: agentScope, tokenLimit: 2_000, costLimit: 10, currency: "USD" });

    const status = usage.budgetStatus(agentScope);
    expect(status).toBeDefined();
    if (status !== undefined) {
      expect(status.budget.tokenLimit).toBe(2_000);
      expect(status.consumedTokens.total.value).toBe(1_000);
      expect(status.tokenPercent).toBe(50);
      // Cost = (400/1e6)*3 + (600/1e6)*15 = 0.0102 → 0.1% of the $10 budget.
      expect(status.costPercent).toBeCloseTo(0.1, 1);
    }
  });

  it("replaces a budget on the same scope", () => {
    const usage = createTestUsage();
    usage.setBudget({ scope: agentScope, tokenLimit: 100 });
    usage.setBudget({ scope: agentScope, tokenLimit: 200 });
    expect(usage.listBudgets()).toHaveLength(1);
    expect(usage.budgetStatus(agentScope)?.budget.tokenLimit).toBe(200);
  });

  it("returns undefined when no budget is set", () => {
    const usage = createTestUsage();
    expect(usage.budgetStatus(agentScope)).toBeUndefined();
  });

  it("treats the user scope as all consumption", async () => {
    const usage = createTestUsage();
    await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 1,
      inputTokens: 20,
      outputTokens: 0,
    });
    usage.setBudget({ scope: userScope, tokenLimit: 100 });
    const status = usage.budgetStatus(userScope);
    expect(status?.consumedTokens.total.value).toBe(20);
    expect(status?.tokenPercent).toBe(20);
  });
});

describe("UsageService limits (hard caps — fail safe)", () => {
  it("allows under and at the cap, denies over it", async () => {
    const usage = createTestUsage();
    await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 1,
      inputTokens: 100,
      outputTokens: 200,
    });
    usage.setLimit({ scope: agentScope, tokenLimit: 600 });

    const under = usage.checkLimit(agentScope, {
      tokens: { source: "estimated", value: 100 },
      cost: { source: "unknown", value: null },
    });
    expect(under.ok).toBe(true);
    if (under.ok) expect(under.value.allowed).toBe(true);

    const at = usage.checkLimit(agentScope, {
      tokens: { source: "estimated", value: 300 },
      cost: { source: "unknown", value: null },
    });
    expect(at.ok).toBe(true);

    const over = usage.checkLimit(agentScope, {
      tokens: { source: "estimated", value: 301 },
      cost: { source: "unknown", value: null },
    });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error).toBeInstanceOf(UsageLimitExceededError);
      expect((over.error as UsageLimitExceededError).check.allowed).toBe(false);
    }
  });

  it("denies an unverifiable call when a cap is configured (never fails open)", () => {
    const usage = createTestUsage();
    usage.setLimit({ scope: agentScope, tokenLimit: 100 });
    const result = usage.checkLimit(agentScope);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(UsageLimitExceededError);
    }
  });

  it("always allows when no limit is configured", async () => {
    const usage = createTestUsage();
    await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 1,
      inputTokens: 100,
      outputTokens: 100,
    });
    const result = usage.checkLimit(agentScope, {
      tokens: { source: "estimated", value: 10_000 },
      cost: { source: "unknown", value: null },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.limit).toBeNull();
      expect(result.value.allowed).toBe(true);
    }
  });

  it("denies a cost overage", async () => {
    const usage = createTestUsage();
    await usage.record({
      source: "provider",
      provider: "claude",
      model: "claude-sonnet-5",
      latencyMs: 1,
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    usage.setLimit({ scope: agentScope, costLimit: 3.5, currency: "USD" });
    const result = usage.checkLimit(agentScope, {
      tokens: { source: "unknown", value: null },
      cost: { source: "estimated", value: 1 },
    });
    expect(result.ok).toBe(false);
  });
});
