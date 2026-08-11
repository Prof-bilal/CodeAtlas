import type { Result } from "@atlas/shared";

/**
 * How a measured quantity was obtained — the tri-state provenance model.
 *
 * CodeAtlas never fabricates precision:
 * - **actual** — the provider/service reported the exact value;
 * - **estimated** — derived from a documented heuristic and clearly labeled
 *   (e.g. "published list price, not verified" for pricing, character→token
 *   estimates for tokens);
 * - **unknown** — no data available; the value is `null` and never guessed.
 */
export type QuantitySource = "actual" | "estimated" | "unknown";

/** A quantity plus its provenance. `value` is `null` whenever `source` is
 * `"unknown"` — callers must not invent a number. */
export interface MeasuredQuantity {
  readonly source: QuantitySource;
  readonly value: number | null;
  /** Human-readable provenance note (why estimated / unknown). */
  readonly note?: string;
}

/** Token counts for one usage event, each with its own provenance. */
export interface TokenUsageRecord {
  readonly input: MeasuredQuantity;
  readonly output: MeasuredQuantity;
  readonly total: MeasuredQuantity;
}

/** A cost snapshot, computed at record time from tokens + pricing. */
export interface CostRecord {
  /** ISO 4217 currency code, or `null` when unknown. */
  readonly currency: string | null;
  /** Total cost (input + output); `unknown` when tokens or pricing are unknown. */
  readonly amount: MeasuredQuantity;
}

/** Per-1M-token prices for one provider/model. */
export interface ModelPrice {
  readonly provider: string;
  readonly model: string;
  readonly currency: string | null;
  readonly inputPerMillion: MeasuredQuantity;
  readonly outputPerMillion: MeasuredQuantity;
}

/**
 * The provider pricing abstraction. The usage service only ever sees this
 * interface — price data lives behind it (per-provider adapters / tables) and
 * is **never** a `if (provider === …)` switch inside business logic. A lookup
 * may yield `actual`, `estimated`, or `unknown` prices, or fail when the
 * provider/model is not known.
 */
export interface PricingSource {
  /** Resolve the price for a provider + model, or fail when unknown. */
  priceFor(provider: string, model: string): Promise<Result<ModelPrice>>;
  /** The provider ids this source knows about (discovery/debug). */
  listProviders(): readonly string[];
}

/** A usage event observed at a collection seam (provider call or agent run). */
export type UsageEventInput =
  | {
      /** A single provider model call. */
      readonly source: "provider";
      /** Adapter/provider id that produced the call (e.g. `"claude"`). */
      readonly provider: string;
      /** Model id reported by the provider. */
      readonly model: string;
      /** Number of provider requests this event covers (default `1`). */
      readonly requestCount?: number;
      /** Wall-clock latency of the call, in ms. */
      readonly latencyMs: number;
      /** Exact input tokens, when the provider reported them. */
      readonly inputTokens?: number;
      /** Exact output tokens, when the provider reported them. */
      readonly outputTokens?: number;
      /** Exact total tokens, when the provider reported them. */
      readonly totalTokens?: number;
      /** Agent id owning the call; defaults to `provider`. */
      readonly agent?: string;
      /** Session the call ran in, when known. */
      readonly sessionId?: string;
      /** Task 17 plan/role id when the call ran as part of a plan. */
      readonly taskId?: string;
      /** Anonymized/hashed task reference — never raw task text. */
      readonly taskRef?: string;
      /** ISO timestamp; defaults to now. */
      readonly occurredAt?: string;
    }
  | {
      /** An agent session / AI CLI run (no token or model data). */
      readonly source: "session";
      readonly provider: string;
      /** Agent id owning the run; defaults to `provider`. */
      readonly agent?: string;
      /** Session the run belonged to, when known. */
      readonly sessionId?: string;
      /** Task 17 plan/role id when the run was part of a plan. */
      readonly taskId?: string;
      /** Anonymized/hashed task reference — never raw task text. */
      readonly taskRef?: string;
      /** Number of requests the run covered (usually `1`). */
      readonly requestCount: number;
      /** Wall-clock latency in ms; omitted/`null` when unknown. */
      readonly latencyMs?: number | null;
      readonly exitCode?: number | null;
      readonly timedOut?: boolean;
      /** ISO timestamp; defaults to now. */
      readonly occurredAt?: string;
    };

/** A persisted usage record (the normalized form of a {@link UsageEventInput}). */
export interface UsageRecord {
  readonly id: string;
  readonly source: "provider" | "session";
  /** Agent that produced the usage (defaults to `provider`). */
  readonly agent: string;
  readonly provider: string;
  /** Model id; `null` when unknown (agent runs never know their model). */
  readonly model: string | null;
  readonly sessionId: string | null;
  readonly taskId: string | null;
  /** Anonymized task reference; never raw task text. */
  readonly taskRef: string | null;
  /** ISO timestamp of the event. */
  readonly occurredAt: string;
  readonly requestCount: number;
  readonly latencyMs: number | null;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly tokens: TokenUsageRecord;
  readonly cost: CostRecord;
}

/** Filters for {@link UsagePort.listUsage} / {@link UsagePort.statistics}. */
export interface UsageQuery {
  readonly provider?: string;
  readonly agent?: string;
  readonly sessionId?: string;
  readonly taskId?: string;
  /** Inclusive ISO start bound (event `occurredAt >= from`). */
  readonly from?: string;
  /** Inclusive ISO end bound (event `occurredAt <= to`). */
  readonly to?: string;
  readonly limit?: number;
}

/** Latency aggregation over the matching events. */
export interface LatencyStatistics {
  readonly samples: number;
  readonly avgMs: MeasuredQuantity;
  readonly maxMs: MeasuredQuantity;
  readonly p95Ms: MeasuredQuantity;
}

/** Aggregates for one group (provider or day). */
export interface GroupedUsageStatistics {
  readonly events: number;
  readonly requests: number;
  readonly tokens: TokenUsageRecord;
  readonly cost: CostRecord;
}

/** Rolled-up usage across the matching events. */
export interface UsageStatistics {
  readonly events: number;
  readonly requests: number;
  readonly tokens: TokenUsageRecord;
  readonly cost: CostRecord;
  readonly latency: LatencyStatistics;
  readonly byProvider: Readonly<Record<string, GroupedUsageStatistics>>;
  /** Keyed by `YYYY-MM-DD` (derived from `occurredAt`) — trends over time. */
  readonly byDay: Readonly<Record<string, GroupedUsageStatistics>>;
}

/** Scope of a budget or limit (which agent/provider/session/user it applies to). */
export interface UsageScope {
  readonly kind: "agent" | "provider" | "session" | "user";
  readonly value: string;
}

/** Input for {@link UsagePort.setBudget}. */
export interface BudgetInput {
  readonly scope: UsageScope;
  /** Soft cap on consumed tokens for the scope; `undefined` = no token budget. */
  readonly tokenLimit?: number;
  /** Soft cap on consumed cost for the scope; `undefined` = no cost budget. */
  readonly costLimit?: number;
  /** Currency the `costLimit` is denominated in. */
  readonly currency?: string;
}

/** A persisted token/cost budget (soft target — never blocks calls). */
export interface Budget {
  readonly id: string;
  readonly scope: UsageScope;
  readonly tokenLimit: number | null;
  readonly costLimit: number | null;
  readonly currency: string | null;
  readonly createdAt: string;
}

/** Current consumption vs a budget. */
export interface BudgetStatus {
  readonly budget: Budget;
  readonly consumedTokens: MeasuredQuantity;
  readonly consumedCost: MeasuredQuantity;
  /** 0–100, or `null` when there is no token limit / no data. */
  readonly tokenPercent: number | null;
  readonly costPercent: number | null;
}

/** Input for {@link UsagePort.setLimit}. */
export interface LimitInput {
  readonly scope: UsageScope;
  /** Hard cap on consumed tokens; `undefined` = no token cap. */
  readonly tokenLimit?: number;
  /** Hard cap on consumed cost; `undefined` = no cost cap. */
  readonly costLimit?: number;
  /** Currency the `costLimit` is denominated in. */
  readonly currency?: string;
}

/** A persisted hard cap that **blocks** an agent call when exceeded. */
export interface UsageLimit {
  readonly id: string;
  readonly scope: UsageScope;
  readonly tokenLimit: number | null;
  readonly costLimit: number | null;
  readonly currency: string | null;
  readonly createdAt: string;
}

/** A projected (about-to-run) call checked against a limit. */
export interface UsageProjection {
  /** The event's tokens; `unknown` when the caller cannot predict them. */
  readonly tokens: MeasuredQuantity;
  /** The event's cost; `unknown` when the caller cannot predict it. */
  readonly cost: MeasuredQuantity;
}

/**
 * The result of a limit check. The run seam consults `allowed`; when it is
 * `false`, `UsagePort.checkLimit` returns a **failed** `Result` so callers
 * deny the call by default (fail safe). Reads of existing usage are never
 * blocked. `limit` is `null` when no limit is configured for the scope (the
 * check then always allows).
 */
export interface LimitCheck {
  readonly scope: UsageScope;
  readonly limit: UsageLimit | null;
  readonly currentTokens: MeasuredQuantity;
  readonly currentCost: MeasuredQuantity;
  readonly projectedTokens: MeasuredQuantity;
  readonly projectedCost: MeasuredQuantity;
  readonly allowed: boolean;
  /** Why the check denied the call, or `null` when allowed. */
  readonly reason: string | null;
}

/**
 * The Usage / Credits contract (Task 18).
 *
 * Collects, persists, aggregates, and enforces AI usage — agent, provider,
 * model, task, session, tokens, requests, latency, and cost — always with the
 * tri-state actual/estimated/unknown provenance, and never with hardcoded
 * provider pricing in business logic (prices come from a {@link PricingSource}).
 *
 * Data is local-first: records never contain prompts, API keys, or provider
 * secrets; task references are anonymized.
 */
export interface UsagePort {
  /** Record a usage event (the collector seam). Computes cost via pricing. */
  record(event: UsageEventInput): Promise<Result<UsageRecord>>;
  /** One usage record by id, or `undefined`. */
  getUsage(id: string): UsageRecord | undefined;
  /** Raw usage records, oldest → newest, optionally filtered/limited. */
  listUsage(query?: UsageQuery): readonly UsageRecord[];
  /** Aggregates over the matching records. */
  statistics(query?: UsageQuery): UsageStatistics;
  /** Create or replace a budget for a scope. */
  setBudget(input: BudgetInput): Result<Budget>;
  /** Current consumption vs the scope's budget, or `undefined` when unset. */
  budgetStatus(scope: UsageScope): BudgetStatus | undefined;
  listBudgets(): readonly Budget[];
  /** Create or replace a hard limit for a scope. */
  setLimit(input: LimitInput): Result<UsageLimit>;
  /**
   * Check whether a (projected) call stays within the scope's hard limit.
   * Fails with a "limit exceeded" error when it would not — deny by default.
   */
  checkLimit(scope: UsageScope, projection?: UsageProjection): Result<LimitCheck>;
  listLimits(): readonly UsageLimit[];
  /** Close the underlying store (SQLite handle). */
  close(): void;
}
