import type { ContextTaskCategory } from "./context.port";

/**
 * Deterministic task entities extracted from the task string.
 *
 * Re-exported from `@atlas/sdk` context-integration for port contract
 * completeness; the core port depends only on this shape, not the
 * implementation.
 */
export interface TaskEntities {
  readonly filePaths: readonly string[];
  readonly symbolNames: readonly string[];
  readonly keywords: readonly string[];
}

/**
 * The result of deterministic task classification (Phase 2, P2.2).
 *
 * Classification is purely keyword/graph-based — no AI. A model-refinement
 * hook is stubbed for future use but the default path is deterministic.
 */
export interface TaskClassification {
  /** The high-level task category (reuses the existing ContextTaskCategory). */
  readonly category: ContextTaskCategory;
  /** A finer-grained subcategory label (e.g. "auth-bug", "api-feature"). */
  readonly subcategory: string;
  /** Confidence score: 0 = no confidence, 1 = certain. */
  readonly confidence: number;
  /** Deterministic human-readable explanation of the classification. */
  readonly reasoning: string;
  /** The entities extracted from the task text. */
  readonly entities: TaskEntities;
}

/**
 * Deterministic task classifier port (Phase 2, ADR-015).
 *
 * Classifies a raw task string into a category + subcategory with a
 * confidence score. The implementation is pure computation (keyword
 * scoring + graph signals) — no AI, no IO.
 */
export interface TaskClassifierPort {
  /**
   * Classify a task string deterministically.
   *
   * @param task - The raw user task text.
   * @returns A classification with category, confidence, and reasoning.
   */
  classify(task: string): TaskClassification;
}
