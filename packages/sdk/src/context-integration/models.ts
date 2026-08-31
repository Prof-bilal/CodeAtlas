/**
 * Normalized, serializable models for the Context → Agent integration layer.
 *
 * A {@link ContextPackage} is the provider-independent, budgeted selection of
 * repository context assembled for one user task. It is designed to be:
 * - **ranked** — every item carries a score plus a human-readable reason,
 * - **budgeted** — capped by item count and token estimate, with truncation
 *   recorded on the package itself,
 * - **safe** — secret-bearing files are filtered out and the exclusion is
 *   recorded,
 * - **honest about staleness** — the index may be older than the working tree,
 *   and the package says so,
 * - **serializable** — plain data, no functions, no AI-CLI-specific formatting.
 */

import type { ContextTier, LineRange, SummaryContent, SummaryMetadata } from "@atlas/core";
import type { FreshnessSignal, FreshnessState } from "../context/models";

/**
 * The honesty signal about the index vs the working tree — shared shape with
 * the Context SDK's {@link FreshnessSignal}.
 */
export type StaleContextSignal = FreshnessSignal;

/** The staleness state (`fresh` / `stale` / `unknown` / `unavailable`). */
export type StalenessState = FreshnessState;

/** The kind of one item in a context package. */
export type ContextItemKind =
  | "file"
  | "symbol"
  | "summary"
  | "dependency"
  | "instructions"
  | "overview"
  | "digest";

/** Where an item came from (for explainability). */
export type ContextItemSource =
  | "search"
  | "explicit"
  | "summary"
  | "dependency"
  | "dependency-chain"
  | "instructions"
  | "overview"
  | "digest";

/** One selected piece of context, with its selection explanation. */
export interface ContextPackageItem {
  /** Stable, dedupe-able id inside the package (e.g. `file:<path>`). */
  readonly id: string;
  readonly kind: ContextItemKind;
  /** Human-readable title (file path, symbol name, edge label, …). */
  readonly title: string;
  /** A file path when the item maps to one (files, symbols, summaries, instructions). */
  readonly path: string | null;
  /** The normalized text that will be sent to the agent. */
  readonly content: string;
  /** Deterministic relevance score (higher = more relevant; `0` = auxiliary). */
  readonly score: number;
  readonly source: ContextItemSource;
  /** Why this item was chosen (human-readable, explainable). */
  readonly reason: string;
  /** True when the content was truncated to fit the per-item token cap. */
  readonly truncated: boolean;
  /** Estimated token count of `content` (deterministic heuristic). */
  readonly tokens: number;
  /**
   * Hierarchy tier (additive, ADR-014 / Phase 1 P1.5). Absent = "unranked";
   * budgets consume tiers top-first and never drop critical items.
   */
  readonly tier?: ContextTier;
  /**
   * Relevant 1-based inclusive line ranges of the source file (additive,
   * ADR-014). Present for symbol items (their exact declaration span) and
   * for file items when only specific ranges are known relevant.
   */
  readonly ranges?: readonly LineRange[];
}

/** Configurable caps for a context package. */
export interface ContextBudget {
  /** Maximum number of items in the package (default 20). */
  readonly maxItems: number;
  /** Maximum estimated tokens per item (default 2000). */
  readonly maxTokensPerItem: number;
  /** Maximum estimated tokens across the whole package (default 12000). */
  readonly maxTokensTotal: number;
}

/** What the budget enforcement actually did (recorded on the package). */
export interface BudgetRecord {
  /** The effective budget that was applied. */
  readonly budget: ContextBudget;
  /** How many candidate items existed before budget enforcement. */
  readonly itemsRequested: number;
  /** How many items survived enforcement. */
  readonly itemsIncluded: number;
  /** Estimated tokens of the final package. */
  readonly tokensEstimated: number;
  /** Item ids dropped because the package exceeded `maxItems`. */
  readonly itemsDroppedByCount: readonly string[];
  /** Item ids whose content was truncated to the per-item token cap. */
  readonly itemsTruncated: readonly string[];
  /** Item ids dropped from the tail to fit `maxTokensTotal`. */
  readonly droppedByTokens: readonly string[];
  /** True when the total token cap could not be met (essential items alone exceed it). */
  readonly budgetExceeded: boolean;
}

/** What was deliberately NOT sent, and why. */
export interface ExclusionRecord {
  /** Paths excluded by the secret deny-filter. */
  readonly droppedPaths: readonly string[];
  /** The deny patterns that matched (path- and content-level). */
  readonly droppedPatterns: readonly string[];
}

/** The final, normalized Context Package for one user task. */
export interface ContextPackage {
  readonly task: string;
  /** Ordered items: instructions, then overview, then rank-descending context. */
  readonly items: readonly ContextPackageItem[];
  readonly staleness: StaleContextSignal;
  readonly budget: BudgetRecord;
  readonly exclusions: ExclusionRecord;
}

/** The explainability projection of a package (no bulky content). */
export interface ContextExplanationItem {
  readonly id: string;
  readonly title: string;
  readonly kind: ContextItemKind;
  readonly source: ContextItemSource;
  readonly score: number;
  readonly reason: string;
  readonly truncated: boolean;
  readonly tokens: number;
  /** Hierarchy tier (additive, ADR-014); absent = "unranked". */
  readonly tier?: ContextTier;
}

/** Structured per-item explanation plus the budget/exclusion records. */
export interface ContextExplanation {
  readonly task: string;
  readonly items: readonly ContextExplanationItem[];
  readonly staleness: StaleContextSignal;
  readonly budget: BudgetRecord;
  readonly exclusions: ExclusionRecord;
}

/**
 * The AI-enriched projection of a context package (behind `--ai`): the
 * deterministic package plus a structured model-generated briefing of it. The
 * package itself is always assembled deterministically — the briefing never
 * replaces or alters it.
 */
export interface ContextBriefing {
  readonly task: string;
  /** The structured AI summary: overview + key points. */
  readonly content: SummaryContent;
  /** Generation metadata (provider, model, tokens, cache). */
  readonly metadata: SummaryMetadata;
  /** The exact deterministic package the briefing summarizes. */
  readonly package: ContextPackage;
}
