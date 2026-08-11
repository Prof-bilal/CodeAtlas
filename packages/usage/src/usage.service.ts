import { randomBytes } from "node:crypto";
import type {
  Budget,
  BudgetInput,
  BudgetStatus,
  LimitCheck,
  LimitInput,
  MeasuredQuantity,
  PricingSource,
  UsageEventInput,
  UsageLimit,
  UsagePort,
  UsageProjection,
  UsageQuery,
  UsageRecord,
  UsageScope,
  UsageStatistics,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { aggregateUsage, sumCost, sumTokens } from "./aggregate";
import { combineSources, computeCost } from "./cost";
import { UsageLimitExceededError } from "./errors";
import { normalizeEvent } from "./normalize";
import type { UsageStore } from "./usage-store";

/** Options for constructing a {@link UsageService}. */
export interface UsageServiceOptions {
  readonly store: UsageStore;
  readonly pricing: PricingSource;
}

/**
 * The Usage / Credits service. Implements `UsagePort` on top of the dedicated
 * usage store and the {@link PricingSource} abstraction — no provider prices
 * are hardcoded in business logic, and every token/cost figure carries its
 * actual/estimated/unknown provenance.
 */
export class UsageService implements UsagePort {
  private readonly store: UsageStore;
  private readonly pricing: PricingSource;

  public constructor(options: UsageServiceOptions) {
    this.store = options.store;
    this.pricing = options.pricing;
  }

  // ── recording (the collector seam) ───────────────────────────────────────

  public async record(event: UsageEventInput): Promise<Result<UsageRecord>> {
    const normalized = normalizeEvent(event, newUsageId());
    const price = await this.pricing.priceFor(normalized.provider, normalized.model ?? "");
    const record: UsageRecord = {
      ...normalized,
      cost: computeCost(normalized.tokens, price.ok ? price.value : undefined),
    };
    this.store.insertUsage(record);
    return ok(record);
  }

  // ── reads ────────────────────────────────────────────────────────────────

  public getUsage(id: string): UsageRecord | undefined {
    return this.store.getUsage(id);
  }

  public listUsage(query: UsageQuery = {}): readonly UsageRecord[] {
    return this.store.listUsage(query);
  }

  public statistics(query: UsageQuery = {}): UsageStatistics {
    return aggregateUsage(this.store.listUsage(query));
  }

  // ── budgets (soft targets — never block calls) ───────────────────────────

  public setBudget(input: BudgetInput): Result<Budget> {
    const budget: Budget = {
      id: newUsageId(),
      scope: input.scope,
      tokenLimit: input.tokenLimit ?? null,
      costLimit: input.costLimit ?? null,
      currency: input.currency ?? null,
      createdAt: new Date().toISOString(),
    };
    this.store.upsertBudget(budget);
    return ok(budget);
  }

  public budgetStatus(scope: UsageScope): BudgetStatus | undefined {
    const budget = this.store.getBudget(scope);
    if (budget === undefined) {
      return undefined;
    }
    const records = this.store.listUsage(scopeFilter(scope));
    const consumedTokens = sumTokens(records);
    const consumedCost = sumCost(records);
    return {
      budget,
      consumedTokens,
      consumedCost,
      tokenPercent: percent(budget.tokenLimit, consumedTokens.total.value),
      costPercent: percent(budget.costLimit, consumedCost.amount.value),
    };
  }

  public listBudgets(): readonly Budget[] {
    return this.store.listBudgets();
  }

  // ── limits (hard caps — deny, fail safe) ────────────────────────────────

  public setLimit(input: LimitInput): Result<UsageLimit> {
    const limit: UsageLimit = {
      id: newUsageId(),
      scope: input.scope,
      tokenLimit: input.tokenLimit ?? null,
      costLimit: input.costLimit ?? null,
      currency: input.currency ?? null,
      createdAt: new Date().toISOString(),
    };
    this.store.upsertLimit(limit);
    return ok(limit);
  }

  public checkLimit(scope: UsageScope, projection?: UsageProjection): Result<LimitCheck> {
    const limit = this.store.getLimit(scope);
    const records = this.store.listUsage(scopeFilter(scope));
    const currentTokens = sumTokens(records).total;
    const currentCost = sumCost(records).amount;
    const projectedTokens = projection?.tokens ?? UNKNOWN_PROJECTION;
    const projectedCost = projection?.cost ?? UNKNOWN_PROJECTION;

    if (limit === undefined) {
      return ok({
        scope,
        limit: null,
        currentTokens,
        currentCost,
        projectedTokens,
        projectedCost,
        allowed: true,
        reason: null,
      });
    }

    // Fail safe: an unverifiable call (unknown projected total) is denied when
    // a cap is configured — enforcement never fails open.
    const reasons: string[] = [];
    if (limit.tokenLimit !== null) {
      const total = addQuantities(projectedTokens, currentTokens);
      if (total.value === null) {
        reasons.push(`token limit (${limit.tokenLimit}) cannot be verified`);
      } else if (total.value > limit.tokenLimit) {
        reasons.push(`token limit ${limit.tokenLimit} would be exceeded (${total.value})`);
      }
    }
    if (limit.costLimit !== null) {
      const total = addQuantities(projectedCost, currentCost);
      if (total.value === null) {
        reasons.push(`cost limit (${limit.costLimit}) cannot be verified`);
      } else if (total.value > limit.costLimit) {
        reasons.push(`cost limit ${limit.costLimit} would be exceeded (${total.value})`);
      }
    }

    if (reasons.length > 0) {
      return fail(
        new UsageLimitExceededError(scope, reasons.join("; "), {
          scope,
          limit,
          currentTokens,
          currentCost,
          projectedTokens,
          projectedCost,
          allowed: false,
          reason: reasons.join("; "),
        }),
      );
    }
    return ok({
      scope,
      limit,
      currentTokens,
      currentCost,
      projectedTokens,
      projectedCost,
      allowed: true,
      reason: null,
    });
  }

  public listLimits(): readonly UsageLimit[] {
    return this.store.listLimits();
  }

  public close(): void {
    this.store.close();
  }
}

const UNKNOWN_PROJECTION: MeasuredQuantity = { source: "unknown", value: null };

/** Map a scope kind onto the usage query that scopes its consumption. */
function scopeFilter(scope: UsageScope): UsageQuery {
  switch (scope.kind) {
    case "agent":
      return { agent: scope.value };
    case "provider":
      return { provider: scope.value };
    case "session":
      return { sessionId: scope.value };
    case "user":
      return {};
  }
}

/** current + projected (either unknown → unknown). */
function addQuantities(a: MeasuredQuantity, b: MeasuredQuantity): MeasuredQuantity {
  if (a.value !== null && b.value !== null) {
    return { source: combineSources(a.source, b.source), value: a.value + b.value };
  }
  if (a.value !== null) {
    return a;
  }
  if (b.value !== null) {
    return b;
  }
  return UNKNOWN_PROJECTION;
}

/** Percentage rounded to one decimal; `null` when no limit or no data. */
function percent(limit: number | null, value: number | null): number | null {
  if (limit === null || value === null || limit <= 0) {
    return null;
  }
  return Math.round((value / limit) * 1000) / 10;
}

/** A unique, CLI-safe usage id (16 hex chars). */
function newUsageId(): string {
  return randomBytes(8).toString("hex");
}
