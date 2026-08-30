/**
 * Context sufficiency gate (Phase 1, P1.6 — small-model intelligence
 * execution plan; `context-strategy.md` §7).
 *
 * Four deterministic predicates decide whether the retrieved context is
 * sufficient to answer a task. When any fails, the gate reports insufficient
 * with concrete next steps — the system must say so explicitly and retrieve
 * more, never silently answer from nothing.
 *
 * Pure and deterministic: no AI, no IO, same input ⇒ same verdict.
 */

/** One failed sufficiency predicate. */
export interface SufficiencyFailure {
  /** Stable predicate id for programmatic handling. */
  readonly predicate:
    | "unknown-plan-target"
    | "no-strong-hit"
    | "empty-critical-tier"
    | "zero-closure-dependencies";
  /** Deterministic, human-readable explanation. */
  readonly message: string;
}

/** The verdict of the sufficiency gate. */
export interface SufficiencyResult {
  /** True only when every predicate passes. */
  readonly sufficient: boolean;
  /** The predicates that failed (empty when sufficient). */
  readonly failures: readonly SufficiencyFailure[];
  /** Deterministic next-step hints for the retrieval loop. */
  readonly nextSteps: readonly string[];
}

/** Input to {@link evaluateSufficiency}. */
export interface SufficiencyInput {
  /**
   * Files/symbols the plan (or task) references, as raw strings. File-shaped
   * entries are checked against `indexedPaths`; others against
   * `indexedSymbolNames`.
   */
  readonly planTargets?: readonly string[];
  /** Every path present in the index (forward or native slashes). */
  readonly indexedPaths?: readonly string[];
  /** Every symbol name present in the index. */
  readonly indexedSymbolNames?: readonly string[];
  /**
   * Search hits for the primary entity: `{ path, score }`. A `null` path
   * means the hit was not file-backed.
   */
  readonly searchHits?: readonly { readonly path: string | null; readonly score: number }[];
  /** Minimum score for a hit to count as "strong" (default 1). */
  readonly minScore?: number;
  /** True when the task modifies code (vs pure comprehension). */
  readonly isCodeModification: boolean;
  /** Number of context items in the `critical` tier. */
  readonly criticalCount: number;
  /** Number of unique dependencies the graph closure expanded over. */
  readonly closureDependencyCount: number;
  /** True when the task is expected to span multiple files. */
  readonly isMultiFileTask: boolean;
}

const DEFAULT_MIN_SCORE = 1;

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Evaluate the four sufficiency predicates (context-strategy.md §7):
 *
 * 1. plan targets that are absent from the index (and not genuinely new
 *    files the plan intends to create),
 * 2. no search hit above `minScore` for the primary entity,
 * 3. an empty `critical` tier for a code-modification task,
 * 4. zero graph dependencies closed over for a multi-file task.
 */
export function evaluateSufficiency(input: SufficiencyInput): SufficiencyResult {
  const failures: SufficiencyFailure[] = [];
  const nextSteps: string[] = [];

  // Predicate 1: plan references unknown targets.
  if (input.planTargets !== undefined && input.planTargets.length > 0) {
    const paths = new Set((input.indexedPaths ?? []).map(normalizePath));
    const symbols = new Set((input.indexedSymbolNames ?? []).map((name) => name.toLowerCase()));
    const unknown: string[] = [];
    for (const target of input.planTargets) {
      const looksLikePath = target.includes("/") || /\.[A-Za-z0-9]{1,8}$/.test(target);
      const known = looksLikePath
        ? paths.has(normalizePath(target))
        : symbols.has(target.toLowerCase());
      if (!known) {
        unknown.push(target);
      }
    }
    if (unknown.length > 0) {
      failures.push({
        predicate: "unknown-plan-target",
        message: `Plan references ${unknown.length} target(s) not present in the index: ${unknown.join(", ")}`,
      });
      nextSteps.push(
        "Verify the referenced paths/symbols exist, or mark them as new files the plan will create.",
      );
    }
  }

  // Predicate 2: no strong search hit.
  if (input.searchHits !== undefined) {
    const minScore = input.minScore ?? DEFAULT_MIN_SCORE;
    const hasStrongHit = input.searchHits.some((hit) => hit.path !== null && hit.score >= minScore);
    if (!hasStrongHit) {
      failures.push({
        predicate: "no-strong-hit",
        message: `No search hit scored >= ${minScore} for the primary entity`,
      });
      nextSteps.push(
        "Re-run retrieval with broader entities (keywords instead of exact symbols) before answering.",
      );
    }
  }

  // Predicate 3: empty critical tier for a code-modification task.
  if (input.isCodeModification && input.criticalCount === 0) {
    failures.push({
      predicate: "empty-critical-tier",
      message: "No critical-tier context for a code-modification task",
    });
    nextSteps.push(
      "Expand the closure around the best search hits to identify the files to change.",
    );
  }

  // Predicate 4: suspicious zero-dependency closure on a multi-file task.
  if (input.isMultiFileTask && input.closureDependencyCount === 0) {
    failures.push({
      predicate: "zero-closure-dependencies",
      message: "The graph closure expanded over 0 dependencies for a multi-file task",
    });
    nextSteps.push("Check whether the index is stale, or search for related modules manually.");
  }

  return { sufficient: failures.length === 0, failures, nextSteps };
}
