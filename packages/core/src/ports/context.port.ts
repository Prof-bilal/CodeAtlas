import type { FilePath, Result } from "@atlas/shared";
import type { ContextItem } from "../domain/entities";

/**
 * Task categories for task-aware context ranking (beta audit Fix 4).
 *
 * A caller may hint what kind of task the context is for; the ranker boosts
 * hits whose path/title matches category-relevant patterns (e.g. debugging
 * tasks surface error handlers and validation; security tasks surface config
 * and permission code).
 */
export type ContextTaskCategory = "debug" | "security" | "architecture" | "understand";

/**
 * Context assembly mode (ADR-016 / Phase B).
 *
 * Controls how much context is assembled for a task based on repository size
 * and token budget constraints.
 */
export type ContextMode = "auto" | "auto-escalate" | "digest" | "full" | "off";

/** Ranks and assembles the context to feed to a language model. */
export interface ContextBuilderPort {
  /**
   * Build the most relevant context for `query`.
   *
   * The optional `taskCategory` re-weights hits toward category-relevant code
   * without ever dropping hits — it is a ranking hint, not a filter.
   */
  build(
    query: string,
    limit?: number,
    taskCategory?: ContextTaskCategory,
  ): Promise<Result<readonly ContextItem[]>>;

  /** Retrieve the context item for a specific file, if present. */
  sourceFile(path: FilePath): Promise<Result<ContextItem | undefined>>;
}
