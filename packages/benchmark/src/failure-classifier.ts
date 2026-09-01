import type {
  BenchmarkEvaluation,
  BenchmarkEvaluationEntry,
  BenchmarkTaskResult,
  FailureCategory,
  FailureClassification,
} from "@atlas/core";

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

/**
 * Classify a single task's failure into one of the four Phase A2 categories.
 *
 * Categories:
 *   budget_truncation  — fileRatio < 0.5 AND tokens near budget cap; context was cut
 *   lexical_miss       — expected file not cited, no hallucinations; retrieval missed it
 *   context_overload   — many cited files + low conceptRatio + wrongFiles; model confused
 *   tool_loop_underuse — toolCallCount <= 1 + low score; model stopped exploring too early
 *   insufficient_signal — none of the above matched; evaluation data insufficient
 *
 * Returns `undefined` when the task scored correct (score === 2) — classification
 * only applies to failures.
 */
export function classifyFailure(
  taskResult: BenchmarkTaskResult,
  evaluation: BenchmarkEvaluation,
): FailureClassification | undefined {
  if (evaluation.score === 2) return undefined;

  const { toolCallCount, tokens, observability, timedOut, toolCalls } = taskResult;
  const { fileRatio, conceptRatio, citedFiles, wrongFiles, hallucinatedFiles, filesExpected } =
    evaluation;

  // Timed out or errored — always budget_truncation
  if (timedOut || taskResult.error !== undefined) {
    return {
      category: "budget_truncation",
      reason: timedOut
        ? `Task timed out after ${taskResult.durationMs}ms`
        : `Task errored: ${taskResult.error}`,
      proposedFix: "Increase task timeout or reduce context budget to finish within time limit.",
    };
  }

  // Tool loop underuse: model made ≤ 1 tool call and scored poorly
  if (toolCallCount <= 1 && evaluation.score < 2) {
    return {
      category: "tool_loop_underuse",
      reason: `Only ${toolCallCount} tool call(s) made; model stopped exploring too early (score: ${evaluation.score}).`,
      proposedFix:
        "Investigate prompt guidance or CONTEXT_GUIDANCE to encourage more tool exploration on complex tasks.",
    };
  }

  // Budget truncation: low fileRatio AND high token usage relative to output
  const hasHighTokenUsage = tokens.input > 0 && tokens.total > 10_000;
  const lowFileRatio = fileRatio < 0.5;
  const budgetExceeded =
    observability?.metrics?.duplicate_context_percent?.value !== null &&
    observability?.metrics?.duplicate_context_percent?.value !== undefined &&
    (observability.metrics.duplicate_context_percent.value as number) > 50;
  const truncatedToolOutputs = toolCalls.some((tc) => tc.output?.includes("[truncated]"));

  if (lowFileRatio && (hasHighTokenUsage || budgetExceeded || truncatedToolOutputs)) {
    return {
      category: "budget_truncation",
      reason: `fileRatio ${evaluation.fileRatio} with ${fmtTokens(tokens.total)} total tokens${
        truncatedToolOutputs ? "; tool outputs truncated" : ""
      }${budgetExceeded ? "; duplicate context > 50%" : ""}.`,
      proposedFix:
        "Protect Critical-tier content from truncation; degrade Supporting/Optional tiers first.",
    };
  }

  // Context overload: many cited files but low concept precision + wrong files
  const citedCount = citedFiles.length;
  const wrongCount = wrongFiles?.length ?? 0;
  if (citedCount >= 5 && conceptRatio < 0.4 && wrongCount > 0) {
    return {
      category: "context_overload",
      reason: `${citedCount} files cited but conceptRatio ${evaluation.conceptRatio} with ${wrongCount} wrong file(s); model overwhelmed by context volume.`,
      proposedFix:
        "Reduce context volume or improve ranking precision; consider regime-aware digest mode.",
    };
  }

  // Lexical miss: expected files not found, no hallucinations, no overload
  const expectedCount = filesExpected.length;
  const foundCount = evaluation.filesFound.length;
  const missCount = expectedCount - foundCount;
  const hallucinatedCount = hallucinatedFiles?.length ?? 0;
  if (missCount > 0 && hallucinatedCount === 0 && fileRatio < 0.5) {
    return {
      category: "lexical_miss",
      reason: `${missCount}/${expectedCount} expected files not found in response; retrieval missed them (no hallucinations).`,
      proposedFix:
        "Improve retrieval recall: graph-aware expansion, query-term expansion, or embedding scorer.",
    };
  }

  // Fallback
  return {
    category: "insufficient_signal",
    reason: `score ${evaluation.score}, fileRatio ${evaluation.fileRatio}, conceptRatio ${evaluation.conceptRatio}; no dominant failure pattern.`,
    proposedFix: "Collect more data or adjust classification thresholds.",
  };
}

// ---------------------------------------------------------------------------
// Batch classification
// ---------------------------------------------------------------------------

export interface FailureClassificationEntry {
  readonly taskId: string;
  readonly mode: string;
  readonly category: FailureCategory;
  readonly reason: string;
  readonly proposedFix: string;
}

export interface FailureClassificationReport {
  /** Per-task classifications (only for tasks that failed or partially failed). */
  readonly entries: readonly FailureClassificationEntry[];
  /** Aggregate counts by category. */
  readonly aggregate: Readonly<Record<FailureCategory, number>>;
  /** Total failures classified. */
  readonly totalFailures: number;
  /** Total tasks evaluated. */
  readonly totalTasks: number;
}

/**
 * Classify failures across all task results in a suite.
 *
 * @param taskResults - All task results (all modes)
 * @param evaluations - All evaluation entries (indexed by taskId + mode)
 * @returns Classification report with per-task entries and aggregate counts
 */
export function classifyAllFailures(
  taskResults: readonly BenchmarkTaskResult[],
  evaluations: readonly BenchmarkEvaluationEntry[],
): FailureClassificationReport {
  const entries: FailureClassificationEntry[] = [];
  const aggregate: Record<FailureCategory, number> = {
    budget_truncation: 0,
    lexical_miss: 0,
    context_overload: 0,
    tool_loop_underuse: 0,
    insufficient_signal: 0,
  };

  for (const result of taskResults) {
    const ev = evaluations.find((e) => e.taskId === result.taskId && e.mode === result.mode);
    if (ev === undefined) continue;

    const classification = classifyFailure(result, ev.evaluation);
    if (classification === undefined) continue;

    entries.push({
      taskId: result.taskId,
      mode: result.mode,
      category: classification.category,
      reason: classification.reason,
      proposedFix: classification.proposedFix,
    });
    aggregate[classification.category] += 1;
  }

  return {
    entries,
    aggregate,
    totalFailures: entries.length,
    totalTasks: taskResults.length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTokens(n: number): string {
  if (!Number.isFinite(n)) return "N/A";
  return n.toLocaleString("en-US");
}
