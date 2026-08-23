import type {
  BenchmarkConfig,
  BenchmarkEvaluationEntry,
  BenchmarkReport,
  BenchmarkStatus,
  BenchmarkTaskResult,
  TaskFile,
} from "@atlas/core";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "N/A";
  return Number(n.toFixed(digits)).toLocaleString("en-US");
}

function fmtTokens(n: number): string {
  if (!Number.isFinite(n)) return "N/A";
  return n.toLocaleString("en-US");
}

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return "N/A";
  return ms >= 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return "N/A";
  return `${Number(n.toFixed(1))}%`;
}

const CATEGORY_LABELS: Record<string, string> = {
  "repository-understanding": "Repo Understanding",
  "file-discovery": "File Discovery",
  "dependency-tracing": "Dependency Tracing",
  "bug-investigation": "Bug Investigation",
  "feature-planning": "Feature Planning",
  "code-modification": "Code Modification",
  testing: "Testing",
  "cross-file-reasoning": "Cross-File Reasoning",
};

// ---------------------------------------------------------------------------
// Per-repository report
// ---------------------------------------------------------------------------

interface RepoReportData {
  readonly suiteId: string;
  readonly config: BenchmarkConfig;
  readonly tasks: readonly BenchmarkTaskResult[];
  readonly evaluations: readonly BenchmarkEvaluationEntry[];
  readonly status: BenchmarkStatus;
  readonly taskFile?: TaskFile;
}

/**
 * Render a per-repository Markdown benchmark report.
 */
export function renderReport(data: RepoReportData): BenchmarkReport {
  const lines: string[] = [];
  const { config, tasks, evaluations, status } = data;

  lines.push(`# Benchmark Report — ${config.name}`);
  lines.push("");
  lines.push(`**Suite:** ${config.id}`);
  lines.push(`**Agent:** ${config.agent}`);
  lines.push(`**Model:** ${config.model}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Status:** ${status.status} (${status.completed}/${status.total} tasks)`);
  lines.push("");

  // Token summary
  const baseline = tasks.filter((t) => t.mode === "baseline");
  const codeatlas = tasks.filter((t) => t.mode === "codeatlas");

  const baseTokens = sumTokens(baseline);
  const catTokens = sumTokens(codeatlas);
  const baseCost = baseline.reduce((s, t) => s + t.cost, 0);
  const catCost = codeatlas.reduce((s, t) => s + t.cost, 0);
  const baseAvgMs = avg(baseline.map((t) => t.durationMs));
  const catAvgMs = avg(codeatlas.map((t) => t.durationMs));

  lines.push("## Token & Cost Summary");
  lines.push("");
  lines.push("| Metric | Baseline | CodeAtlas | Delta |");
  lines.push("|--------|----------|-----------|-------|");
  lines.push(
    `| Total tokens | ${fmtTokens(baseTokens)} | ${fmtTokens(catTokens)} | ${fmtTokens(baseTokens - catTokens)} |`,
  );
  lines.push(
    `| Cost (USD) | $${fmt(baseCost, 4)} | $${fmt(catCost, 4)} | $${fmt(baseCost - catCost, 4)} |`,
  );
  lines.push(
    `| Avg duration | ${fmtMs(baseAvgMs)} | ${fmtMs(catAvgMs)} | ${fmtMs(baseAvgMs - catAvgMs)} |`,
  );
  lines.push("");

  // Accuracy summary
  const baseEvals = evaluations.filter((e) => e.mode === "baseline");
  const catEvals = evaluations.filter((e) => e.mode === "codeatlas");
  const baseAvgScore = avg(baseEvals.map((e) => e.evaluation.score));
  const catAvgScore = avg(catEvals.map((e) => e.evaluation.score));

  lines.push("## Accuracy Summary");
  lines.push("");
  lines.push("| Metric | Baseline | CodeAtlas | Delta |");
  lines.push("|--------|----------|-----------|-------|");
  lines.push(
    `| Avg score (0-2) | ${fmt(baseAvgScore)} | ${fmt(catAvgScore)} | ${fmt(catAvgScore - baseAvgScore)} |`,
  );
  lines.push(
    `| Correct | ${countStatus(baseEvals, "correct")} | ${countStatus(catEvals, "correct")} | — |`,
  );
  lines.push(
    `| Partial | ${countStatus(baseEvals, "partially_correct")} | ${countStatus(catEvals, "partially_correct")} | — |`,
  );
  lines.push(
    `| Incorrect | ${countStatus(baseEvals, "incorrect")} | ${countStatus(catEvals, "incorrect")} | — |`,
  );
  lines.push(
    `| Failed | ${countStatus(baseEvals, "failed")} | ${countStatus(catEvals, "failed")} | — |`,
  );
  lines.push("");

  // Task details
  lines.push("## Task Results");
  lines.push("");
  lines.push("| ID | Category | Score (B/C) | Tokens (B/C) | Duration (B/C) | Tools (C) |");
  lines.push("|----|----------|-------------|--------------|----------------|-----------|");

  const taskIds = [...new Set(tasks.map((t) => t.taskId))];
  for (const tid of taskIds) {
    const b = tasks.find((t) => t.taskId === tid && t.mode === "baseline");
    const c = tasks.find((t) => t.taskId === tid && t.mode === "codeatlas");
    const be = evaluations.find((e) => e.taskId === tid && e.mode === "baseline");
    const ce = evaluations.find((e) => e.taskId === tid && e.mode === "codeatlas");
    const cat = b?.category ?? c?.category ?? "unknown";
    const catLabel = CATEGORY_LABELS[cat] ?? cat;

    const bScore = be?.evaluation.score ?? "—";
    const cScore = ce?.evaluation.score ?? "—";
    const bTokens = b?.tokens.total ?? 0;
    const cTokens = c?.tokens.total ?? 0;
    const bMs = b?.durationMs ?? 0;
    const cMs = c?.durationMs ?? 0;
    const cTools = c?.toolCallCount ?? 0;

    lines.push(
      `| ${tid} | ${catLabel} | ${bScore}/${cScore} | ${fmtTokens(bTokens)}/${fmtTokens(cTokens)} | ${fmtMs(bMs)}/${fmtMs(cMs)} | ${cTools} |`,
    );
  }
  lines.push("");

  return {
    suiteId: data.suiteId,
    content: lines.join("\n"),
    format: "markdown",
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cross-repository summary
// ---------------------------------------------------------------------------

interface SummaryData {
  readonly suiteId: string;
  readonly config: BenchmarkConfig;
  readonly results: readonly RepoReportData[];
}

/**
 * Render a cross-repository summary report.
 */
export function renderSummary(data: SummaryData): BenchmarkReport {
  const lines: string[] = [];

  lines.push(`# Benchmark Summary — ${data.config.name}`);
  lines.push("");
  lines.push(`**Suite:** ${data.config.id}`);
  lines.push(`**Agent:** ${data.config.agent}`);
  lines.push(`**Model:** ${data.config.model}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");

  for (const repo of data.results) {
    const baseline = repo.tasks.filter((t) => t.mode === "baseline");
    const codeatlas = repo.tasks.filter((t) => t.mode === "codeatlas");
    const baseTokens = sumTokens(baseline);
    const catTokens = sumTokens(codeatlas);
    const savings = baseTokens > 0 ? ((baseTokens - catTokens) / baseTokens) * 100 : 0;

    const baseEvals = repo.evaluations.filter((e) => e.mode === "baseline");
    const catEvals = repo.evaluations.filter((e) => e.mode === "codeatlas");
    const baseAvg = avg(baseEvals.map((e) => e.evaluation.score));
    const catAvg = avg(catEvals.map((e) => e.evaluation.score));

    lines.push(`## ${repo.config.name}`);
    lines.push("");
    lines.push(
      `- Tasks: ${repo.tasks.length / 2} (${repo.status.completed}/${repo.status.total} completed)`,
    );
    lines.push(`- Token savings: ${fmtTokens(baseTokens - catTokens)} (${pct(savings)})`);
    lines.push(
      `- Accuracy delta: ${fmt(catAvg - baseAvg)} (baseline ${fmt(baseAvg)} → CodeAtlas ${fmt(catAvg)})`,
    );
    lines.push("");
  }

  return {
    suiteId: data.suiteId,
    content: lines.join("\n"),
    format: "markdown",
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumTokens(tasks: readonly BenchmarkTaskResult[]): number {
  return tasks.reduce((s, t) => s + t.tokens.total, 0);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function countStatus(evals: readonly BenchmarkEvaluationEntry[], status: string): number {
  return evals.filter((e) => e.evaluation.status === status).length;
}
