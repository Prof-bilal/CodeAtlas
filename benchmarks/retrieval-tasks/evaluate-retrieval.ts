#!/usr/bin/env tsx
// Phase 6 — Full retrieval evaluation against a built index.
//
// Usage:
//   tsx benchmarks/retrieval-tasks/evaluate-retrieval.ts [repo-root]
//
// Requires a built .codeatlas/context.db in the repo root (run `atlas build` first).
// Outputs P@k, R@k, MRR, and per-task details to stdout as JSON.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TaskDefinition } from "@atlas/core";
import {
  type RetrievalReport,
  DEFAULT_K_VALUES,
  evaluateRetrieval,
} from "../../packages/benchmark/src/retrieval-metrics";

// ---------------------------------------------------------------------------
// Task mapping: tasks.json → TaskDefinition[]
// ---------------------------------------------------------------------------

interface RawTask {
  readonly id: string;
  readonly category: string;
  readonly query: string;
  readonly fileTruth: readonly string[];
  readonly symbolTruth: readonly string[];
  readonly hopTruth: number;
  readonly notes?: string;
}

function toTaskDefinition(raw: RawTask): TaskDefinition {
  return {
    id: raw.id,
    category: raw.category as TaskDefinition["category"],
    prompt: raw.query,
    expected_files: raw.fileTruth,
    expected_concepts: raw.symbolTruth,
    evaluation_method: "retrieval-top-k",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const repoRoot = resolve(process.argv[2] ?? ".");
  const tasksPath = resolve(
    process.argv[3] ?? "benchmarks/retrieval-tasks/tasks.json",
  );

  // Load tasks
  const rawTasks: RawTask[] = JSON.parse(readFileSync(tasksPath, "utf8"));
  const tasks: TaskDefinition[] = rawTasks.map(toTaskDefinition);

  console.error(`Loaded ${tasks.length} tasks from ${tasksPath}`);

  // Create ContextSDK — needs a built .codeatlas/context.db
  const { createContextSDK } = await import("../../packages/sdk/src/context/sdk");
  const sdk = createContextSDK({ repositoryPath: repoRoot });

  if (!sdk.isAvailable) {
    console.error(
      "ERROR: No context index found. Run `atlas build` in the repo root first.",
    );
    sdk.close();
    process.exit(1);
  }

  console.error(`Context SDK available (repo: ${repoRoot})`);

  // Run retrieval evaluation
  let report: RetrievalReport;
  try {
    report = evaluateRetrieval(sdk, tasks, DEFAULT_K_VALUES, 25, repoRoot);
  } finally {
    sdk.close();
  }

  // Output results
  const output = {
    summary: {
      tasks: report.tasks.length,
      precisionAtK: report.precisionAtK,
      recallAtK: report.recallAtK,
      meanReciprocalRank: report.meanReciprocalRank,
    },
    perTask: report.tasks.map((r) => ({
      taskId: r.taskId,
      category: r.category,
      relevant: r.relevant,
      hitsAtK: r.hitsAtK,
      ranks: r.ranks,
      retrievedCount: r.retrievedPaths.length,
    })),
  };

  console.log(JSON.stringify(output, null, 2));

  // Also print a human-readable summary
  console.error("\n--- Retrieval Quality Summary ---");
  for (const k of DEFAULT_K_VALUES) {
    console.error(
      `  P@${k}: ${report.precisionAtK[k]?.toFixed(4) ?? "N/A"}  R@${k}: ${report.recallAtK[k]?.toFixed(4) ?? "N/A"}`,
    );
  }
  console.error(`  MRR: ${report.meanReciprocalRank.toFixed(4)}`);

  // Per-category breakdown
  const categories = new Map<string, { count: number; mrrSum: number }>();
  for (const r of report.tasks) {
    const cat = categories.get(r.category) ?? { count: 0, mrrSum: 0 };
    cat.count += 1;
    const firstRank = Object.values(r.ranks).find(
      (v): v is number => v !== null,
    );
    cat.mrrSum += firstRank !== undefined ? 1 / firstRank : 0;
    categories.set(r.category, cat);
  }
  console.error("\n--- Per-Category MRR ---");
  for (const [cat, stats] of categories) {
    console.error(
      `  ${cat}: ${(stats.mrrSum / stats.count).toFixed(4)} (${stats.count} tasks)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
