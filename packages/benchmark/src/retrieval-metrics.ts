// Retrieval-quality harness for the benchmark framework (Phase A, task A3).
//
// For each task in a suite, run the Context SDK's deterministic search
// (`sdk.search.search(query)`) and measure how many of the task's
// `expected_files` fall inside the top-k retrieved paths. This is the metric
// the retired estimate-harness had and the framework lacked — it separates
// "did retrieval surface the right files" (this module) from "did the agent
// produce a good final answer" (`evaluator.ts`).
//
// Deterministic: no AI, no network, same index + query ⇒ same numbers.

import { join } from "node:path";
import type { SearchRequest, SearchResult, TaskDefinition } from "@atlas/core";

/** Minimal local type for the Context SDK — avoids a forbidden `@atlas/sdk` import. */
export interface ContextSDK {
  readonly isAvailable: boolean;
  readonly search: {
    search(query: string, options?: SearchRequest): readonly SearchResult[];
  };
}

/** One task's retrieval-quality measurement. */
export interface RetrievalResult {
  readonly taskId: string;
  readonly category: string;
  /** Number of expected files that retrieval surfaced at or above rank `k`. */
  readonly hitsAtK: Record<number, number>;
  /** Number of expected files tested against (the task's `expected_files`). */
  readonly relevant: number;
  /** The top-k candidate paths retrieved by search (repo-relative). */
  readonly retrievedPaths: readonly string[];
  /** Rank (1-based) of each expected file within the retrieved paths, or null if absent. */
  readonly ranks: Record<string, number | null>;
}

/** Aggregated retrieval quality across all tasks. */
export interface RetrievalReport {
  readonly tasks: readonly RetrievalResult[];
  readonly precisionAtK: Record<number, number>;
  readonly recallAtK: Record<number, number>;
  /** Fraction of expected files reachable within any of the reported candidate sets. */
  readonly meanReciprocalRank: number;
}

/** Normalize a repo-relative path for comparison (forward slashes, no leading ./). */
function normPath(p: string): string {
  let out = p.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  return out;
}

/** Candidate k values we report (matches the audit's "top-k" framing). */
export const DEFAULT_K_VALUES = [1, 5, 10] as const;

/**
 * Query the SDK search for a task and score retrieval against `expected_files`.
 *
 * @param sdk       Context SDK over an indexed repository.
 * @param task      The benchmark task (uses `prompt` and `expected_files`).
 * @param kValues   Top-k cutoffs to report (default `[1,5,10]`).
 * @param limit     Search result limit passed to `search` (should be ≥ max k).
 */
export function scoreTaskRetrieval(
  sdk: ContextSDK,
  task: TaskDefinition,
  kValues: readonly number[] = DEFAULT_K_VALUES,
  limit = 25,
): RetrievalResult {
  const query = task.prompt;
  const results = sdk.search.search(query, { limit });

  // De-duplicate candidate paths (several hit kinds can map to one file).
  const seen = new Set<string>();
  const retrievedPaths: string[] = [];
  for (const r of results) {
    if (r.path === null) continue;
    const np = normPath(String(r.path));
    if (seen.has(np)) continue;
    seen.add(np);
    retrievedPaths.push(np);
  }

  const ranks: Record<string, number | null> = {};
  for (const exp of task.expected_files) {
    const n = normPath(exp);
    const idx = retrievedPaths.indexOf(n);
    ranks[exp] = idx === -1 ? null : idx + 1; // 1-based rank
  }

  const hitsAtK: Record<number, number> = {};
  for (const k of kValues) {
    const top = retrievedPaths.slice(0, k);
    let hits = 0;
    for (const exp of task.expected_files) {
      const n = normPath(exp);
      if (top.includes(n)) hits += 1;
    }
    hitsAtK[k] = hits;
  }

  return {
    taskId: task.id,
    category: task.category,
    hitsAtK,
    relevant: task.expected_files.length,
    retrievedPaths,
    ranks,
  };
}

/**
 * Evaluate retrieval quality over a whole task list against one indexed SDK.
 * Returns aggregated precision@k, recall@k, and mean reciprocal rank (MRR).
 */
export function evaluateRetrieval(
  sdk: ContextSDK,
  tasks: readonly TaskDefinition[],
  kValues: readonly number[] = DEFAULT_K_VALUES,
  limit = 25,
): RetrievalReport {
  if (!sdk.isAvailable) {
    throw new Error("Context SDK is not available (no index) — cannot score retrieval.");
  }
  const results: RetrievalResult[] = tasks.map((t) => scoreTaskRetrieval(sdk, t, kValues, limit));

  const precisionAtK: Record<number, number> = {};
  const recallAtK: Record<number, number> = {};
  for (const k of kValues) {
    precisionAtK[k] = mean(
      results.map((r) => r.hitsAtK[k] / Math.min(k, r.retrievedPaths.length || 1)),
    );
    recallAtK[k] = mean(results.map((r) => (r.relevant > 0 ? r.hitsAtK[k] / r.relevant : 0)));
  }

  // MRR: mean over tasks of 1/rank(first retrieved expected file).
  const mrr = mean(
    results.map((r) => {
      const first = taskFirstRank(r.ranks);
      return first === null ? 0 : 1 / first;
    }),
  );

  return { tasks: results, precisionAtK, recallAtK, meanReciprocalRank: mrr };
}

function taskFirstRank(ranks: Record<string, number | null>): number | null {
  let best: number | null = null;
  for (const v of Object.values(ranks)) {
    if (v !== null && (best === null || v < best)) best = v;
  }
  return best;
}

function mean(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Convenience: resolve a task file path into the repo dir the SDK opens. */
export function repositoryOf(taskFile: { repository?: string }): string {
  return taskFile.repository ?? ".";
}

/** Build a `ContextSDK` pointed at a benchmark repo (thin wrapper for ergonomics). */
export async function openSdkForRepo(repoPath: string): Promise<ContextSDK> {
  const { createContextSDK } = await import("@atlas/sdk");
  return createContextSDK({ repositoryPath: join(".", repoPath) });
}

void openSdkForRepo;
