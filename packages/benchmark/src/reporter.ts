import type {
  BenchmarkConfig,
  BenchmarkEvaluationEntry,
  BenchmarkReport,
  BenchmarkStatus,
  BenchmarkTaskResult,
  FailureCategory,
  TaskFile,
} from "@atlas/core";
import { extractScenarioLabel } from "./ablation";

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
  const intel = tasks.filter((t) => t.mode === "codeatlas-intel");
  const hasIntel = intel.length > 0;

  const baseTokens = sumTokens(baseline);
  const catTokens = sumTokens(codeatlas);
  const intelTokens = sumTokens(intel);
  const baseCost = baseline.reduce((s, t) => s + t.cost, 0);
  const catCost = codeatlas.reduce((s, t) => s + t.cost, 0);
  const intelCost = intel.reduce((s, t) => s + t.cost, 0);
  const baseAvgMs = avg(baseline.map((t) => t.durationMs));
  const catAvgMs = avg(codeatlas.map((t) => t.durationMs));
  const intelAvgMs = avg(intel.map((t) => t.durationMs));

  lines.push("## Token & Cost Summary");
  lines.push("");
  if (hasIntel) {
    lines.push("| Metric | Baseline | CodeAtlas | CodeAtlas Intel |");
    lines.push("|--------|----------|-----------|-----------------|");
    lines.push(
      `| Total tokens | ${fmtTokens(baseTokens)} | ${fmtTokens(catTokens)} | ${fmtTokens(intelTokens)} |`,
    );
    lines.push(
      `| Cost (USD) | $${fmt(baseCost, 4)} | $${fmt(catCost, 4)} | $${fmt(intelCost, 4)} |`,
    );
    lines.push(
      `| Avg duration | ${fmtMs(baseAvgMs)} | ${fmtMs(catAvgMs)} | ${fmtMs(intelAvgMs)} |`,
    );
  } else {
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
  }
  lines.push("");

  // Accuracy summary
  const baseEvals = evaluations.filter((e) => e.mode === "baseline");
  const catEvals = evaluations.filter((e) => e.mode === "codeatlas");
  const intelEvals = evaluations.filter((e) => e.mode === "codeatlas-intel");
  const baseAvgScore = avg(baseEvals.map((e) => e.evaluation.score));
  const catAvgScore = avg(catEvals.map((e) => e.evaluation.score));
  const intelAvgScore = avg(intelEvals.map((e) => e.evaluation.score));

  lines.push("## Accuracy Summary");
  lines.push("");
  if (hasIntel) {
    lines.push("| Metric | Baseline | CodeAtlas | CodeAtlas Intel |");
    lines.push("|--------|----------|-----------|-----------------|");
    lines.push(
      `| Avg score (0-2) | ${fmt(baseAvgScore)} | ${fmt(catAvgScore)} | ${fmt(intelAvgScore)} |`,
    );
    lines.push(
      `| Correct | ${countStatus(baseEvals, "correct")} | ${countStatus(catEvals, "correct")} | ${countStatus(intelEvals, "correct")} |`,
    );
    lines.push(
      `| Partial | ${countStatus(baseEvals, "partially_correct")} | ${countStatus(catEvals, "partially_correct")} | ${countStatus(intelEvals, "partially_correct")} |`,
    );
    lines.push(
      `| Incorrect | ${countStatus(baseEvals, "incorrect")} | ${countStatus(catEvals, "incorrect")} | ${countStatus(intelEvals, "incorrect")} |`,
    );
    lines.push(
      `| Failed | ${countStatus(baseEvals, "failed")} | ${countStatus(catEvals, "failed")} | ${countStatus(intelEvals, "failed")} |`,
    );
  } else {
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
  }
  lines.push("");

  // Phase A — Attribution Ledger (per-arm cost breakdown)
  const ledgerLines = renderAttributionLedger(baseline, codeatlas, intel);
  lines.push(...ledgerLines);

  // Phase A — Failure Classification
  const failureLines = renderFailureClassification(tasks);
  lines.push(...failureLines);

  // Phase A — Duplicate Content Audit
  const duplicateLines = renderDuplicateAudit(baseline, codeatlas, intel);
  lines.push(...duplicateLines);

  // Phase A5 — Tool Loop Diagnostics
  const diagLines = renderToolLoopDiagnostics(baseline, codeatlas, intel);
  lines.push(...diagLines);

  // Task details
  const nonAblationTasks = tasks.filter((t) => !extractScenarioLabel(t.taskId));
  const ablationTasks = tasks.filter((t) => extractScenarioLabel(t.taskId) !== null);

  lines.push("## Task Results");
  lines.push("");
  if (hasIntel) {
    lines.push(
      "| ID | Category | Score (B/C/I) | Tokens (B/C/I) | Duration (B/C/I) | Tools (C/I) |",
    );
    lines.push(
      "|----|----------|---------------|----------------|------------------|-------------|",
    );

    const taskIds = [...new Set(nonAblationTasks.map((t) => t.taskId))];
    for (const tid of taskIds) {
      const b = nonAblationTasks.find((t) => t.taskId === tid && t.mode === "baseline");
      const c = nonAblationTasks.find((t) => t.taskId === tid && t.mode === "codeatlas");
      const i = nonAblationTasks.find((t) => t.taskId === tid && t.mode === "codeatlas-intel");
      const be = evaluations.find((e) => e.taskId === tid && e.mode === "baseline");
      const ce = evaluations.find((e) => e.taskId === tid && e.mode === "codeatlas");
      const ie = evaluations.find((e) => e.taskId === tid && e.mode === "codeatlas-intel");
      const cat = b?.category ?? c?.category ?? i?.category ?? "unknown";
      const catLabel = CATEGORY_LABELS[cat] ?? cat;

      const bScore = be?.evaluation.score ?? "—";
      const cScore = ce?.evaluation.score ?? "—";
      const iScore = ie?.evaluation.score ?? "—";
      const bTokens = b?.tokens.total ?? 0;
      const cTokens = c?.tokens.total ?? 0;
      const iTokens = i?.tokens.total ?? 0;
      const bMs = b?.durationMs ?? 0;
      const cMs = c?.durationMs ?? 0;
      const iMs = i?.durationMs ?? 0;
      const cTools = c?.toolCallCount ?? 0;
      const iTools = i?.toolCallCount ?? 0;

      lines.push(
        `| ${tid} | ${catLabel} | ${bScore}/${cScore}/${iScore} | ${fmtTokens(bTokens)}/${fmtTokens(cTokens)}/${fmtTokens(iTokens)} | ${fmtMs(bMs)}/${fmtMs(cMs)}/${fmtMs(iMs)} | ${cTools}/${iTools} |`,
      );
    }
  } else {
    lines.push("| ID | Category | Score (B/C) | Tokens (B/C) | Duration (B/C) | Tools (C) |");
    lines.push("|----|----------|-------------|--------------|----------------|-----------|");

    const taskIds = [...new Set(nonAblationTasks.map((t) => t.taskId))];
    for (const tid of taskIds) {
      const b = nonAblationTasks.find((t) => t.taskId === tid && t.mode === "baseline");
      const c = nonAblationTasks.find((t) => t.taskId === tid && t.mode === "codeatlas");
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
  }
  lines.push("");

  // Ablation comparison (P8.2)
  if (ablationTasks.length > 0) {
    lines.push("## Ablation Comparison");
    lines.push("");
    lines.push("Each row shows a single-feature ablation (one intel feature disabled).");
    lines.push("The `full-intel` row is the un-ablated baseline for comparison.");
    lines.push("");

    const scenarioLabels = [
      "full-intel",
      "no-planner",
      "no-hierarchy",
      "no-verification",
      "no-critic",
    ];

    lines.push("| Scenario | Avg Score | Total Tokens | Avg Duration |");
    lines.push("|----------|-----------|--------------|--------------|");

    for (const label of scenarioLabels) {
      const scenarioTasks = ablationTasks.filter((t) => extractScenarioLabel(t.taskId) === label);
      if (scenarioTasks.length === 0) continue;
      const scenarioEvals = evaluations.filter((e) => extractScenarioLabel(e.taskId) === label);
      const avgScore = avg(scenarioEvals.map((e) => e.evaluation.score));
      const totalTokens = sumTokens(scenarioTasks);
      const avgDuration = avg(scenarioTasks.map((t) => t.durationMs));
      lines.push(
        `| ${label} | ${fmt(avgScore)} | ${fmtTokens(totalTokens)} | ${fmtMs(avgDuration)} |`,
      );
    }
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
    const intel = repo.tasks.filter((t) => t.mode === "codeatlas-intel");
    const hasIntel = intel.length > 0;

    const baseTokens = sumTokens(baseline);
    const catTokens = sumTokens(codeatlas);
    const intelTokens = sumTokens(intel);
    const baseEvals = repo.evaluations.filter((e) => e.mode === "baseline");
    const catEvals = repo.evaluations.filter((e) => e.mode === "codeatlas");
    const intelEvals = repo.evaluations.filter((e) => e.mode === "codeatlas-intel");
    const baseAvg = avg(baseEvals.map((e) => e.evaluation.score));
    const catAvg = avg(catEvals.map((e) => e.evaluation.score));
    const intelAvg = avg(intelEvals.map((e) => e.evaluation.score));

    lines.push(`## ${repo.config.name}`);
    lines.push("");
    lines.push(
      `- Tasks: ${repo.tasks.length / (hasIntel ? 3 : 2)} (${repo.status.completed}/${repo.status.total} completed)`,
    );

    if (hasIntel) {
      const bestTokens = catTokens > 0 ? catTokens : intelTokens;
      const bestAvg = catAvg > 0 ? catAvg : intelAvg;
      const savings = baseTokens > 0 ? ((baseTokens - bestTokens) / baseTokens) * 100 : 0;
      lines.push(`- Token savings: ${fmtTokens(baseTokens - bestTokens)} (${pct(savings)})`);
      lines.push(
        `- Accuracy delta: ${fmt(bestAvg - baseAvg)} (baseline ${fmt(baseAvg)} → CodeAtlas ${fmt(catAvg)} → Intel ${fmt(intelAvg)})`,
      );
    } else {
      const savings = baseTokens > 0 ? ((baseTokens - catTokens) / baseTokens) * 100 : 0;
      lines.push(`- Token savings: ${fmtTokens(baseTokens - catTokens)} (${pct(savings)})`);
      lines.push(
        `- Accuracy delta: ${fmt(catAvg - baseAvg)} (baseline ${fmt(baseAvg)} → CodeAtlas ${fmt(catAvg)})`,
      );
    }
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
// HTML rendering
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("\n");
  return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`;
}

/**
 * Render a per-repository benchmark report as a standalone HTML document.
 * Mirrors {@link renderReport} with the same data, escaping all model/task
 * derived text.
 */
export function renderHtml(data: RepoReportData): BenchmarkReport {
  const { config, tasks, evaluations, status } = data;

  const baseline = tasks.filter((t) => t.mode === "baseline");
  const codeatlas = tasks.filter((t) => t.mode === "codeatlas");
  const intel = tasks.filter((t) => t.mode === "codeatlas-intel");
  const hasIntel = intel.length > 0;

  const baseTokens = sumTokens(baseline);
  const catTokens = sumTokens(codeatlas);
  const intelTokens = sumTokens(intel);
  const baseCost = baseline.reduce((s, t) => s + t.cost, 0);
  const catCost = codeatlas.reduce((s, t) => s + t.cost, 0);
  const intelCost = intel.reduce((s, t) => s + t.cost, 0);
  const baseAvgMs = avg(baseline.map((t) => t.durationMs));
  const catAvgMs = avg(codeatlas.map((t) => t.durationMs));
  const intelAvgMs = avg(intel.map((t) => t.durationMs));

  const baseEvals = evaluations.filter((e) => e.mode === "baseline");
  const catEvals = evaluations.filter((e) => e.mode === "codeatlas");
  const intelEvals = evaluations.filter((e) => e.mode === "codeatlas-intel");
  const baseAvgScore = avg(baseEvals.map((e) => e.evaluation.score));
  const catAvgScore = avg(catEvals.map((e) => e.evaluation.score));
  const intelAvgScore = avg(intelEvals.map((e) => e.evaluation.score));

  const nonAblationTasks = tasks.filter((t) => !extractScenarioLabel(t.taskId));
  const taskRows: string[][] = [];
  const taskIds = [...new Set(nonAblationTasks.map((t) => t.taskId))];
  for (const tid of taskIds) {
    const b = nonAblationTasks.find((t) => t.taskId === tid && t.mode === "baseline");
    const c = nonAblationTasks.find((t) => t.taskId === tid && t.mode === "codeatlas");
    const i = nonAblationTasks.find((t) => t.taskId === tid && t.mode === "codeatlas-intel");
    const be = evaluations.find((e) => e.taskId === tid && e.mode === "baseline");
    const ce = evaluations.find((e) => e.taskId === tid && e.mode === "codeatlas");
    const ie = evaluations.find((e) => e.taskId === tid && e.mode === "codeatlas-intel");
    const cat = b?.category ?? c?.category ?? i?.category ?? "unknown";

    if (hasIntel) {
      taskRows.push([
        tid,
        CATEGORY_LABELS[cat] ?? cat,
        `${be?.evaluation.score ?? "—"} / ${ce?.evaluation.score ?? "—"} / ${ie?.evaluation.score ?? "—"}`,
        `${fmtTokens(b?.tokens.total ?? 0)} / ${fmtTokens(c?.tokens.total ?? 0)} / ${fmtTokens(i?.tokens.total ?? 0)}`,
        `${fmtMs(b?.durationMs ?? 0)} / ${fmtMs(c?.durationMs ?? 0)} / ${fmtMs(i?.durationMs ?? 0)}`,
        `${c?.toolCallCount ?? 0} / ${i?.toolCallCount ?? 0}`,
      ]);
    } else {
      taskRows.push([
        tid,
        CATEGORY_LABELS[cat] ?? cat,
        `${be?.evaluation.score ?? "—"} / ${ce?.evaluation.score ?? "—"}`,
        `${fmtTokens(b?.tokens.total ?? 0)} / ${fmtTokens(c?.tokens.total ?? 0)}`,
        `${fmtMs(b?.durationMs ?? 0)} / ${fmtMs(c?.durationMs ?? 0)}`,
        String(c?.toolCallCount ?? 0),
      ]);
    }
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Benchmark Report — ${escapeHtml(config.name)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.5rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0 2rem; font-size: 0.9rem; }
  th, td { border: 1px solid #d0d0d0; padding: 0.35rem 0.6rem; text-align: left; }
  th { background: #f4f4f4; }
  dl.meta { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
  dt { font-weight: 600; }
</style>
</head>
<body>
<h1>Benchmark Report — ${escapeHtml(config.name)}</h1>
<dl class="meta">
<dt>Suite</dt><dd>${escapeHtml(config.id)}</dd>
<dt>Agent</dt><dd>${escapeHtml(config.agent)}</dd>
<dt>Model</dt><dd>${escapeHtml(config.model)}</dd>
<dt>Generated</dt><dd>${escapeHtml(new Date().toISOString())}</dd>
<dt>Status</dt><dd>${escapeHtml(`${status.status} (${status.completed}/${status.total} tasks)`)}</dd>
</dl>
<h2>Token &amp; Cost Summary</h2>
${
  hasIntel
    ? htmlTable(
        ["Metric", "Baseline", "CodeAtlas", "Intel"],
        [
          ["Total tokens", fmtTokens(baseTokens), fmtTokens(catTokens), fmtTokens(intelTokens)],
          ["Cost (USD)", `$${fmt(baseCost, 4)}`, `$${fmt(catCost, 4)}`, `$${fmt(intelCost, 4)}`],
          ["Avg duration", fmtMs(baseAvgMs), fmtMs(catAvgMs), fmtMs(intelAvgMs)],
        ],
      )
    : htmlTable(
        ["Metric", "Baseline", "CodeAtlas", "Delta"],
        [
          [
            "Total tokens",
            fmtTokens(baseTokens),
            fmtTokens(catTokens),
            fmtTokens(baseTokens - catTokens),
          ],
          [
            "Cost (USD)",
            `$${fmt(baseCost, 4)}`,
            `$${fmt(catCost, 4)}`,
            `$${fmt(baseCost - catCost, 4)}`,
          ],
          ["Avg duration", fmtMs(baseAvgMs), fmtMs(catAvgMs), fmtMs(baseAvgMs - catAvgMs)],
        ],
      )
}
<h2>Accuracy Summary</h2>
${
  hasIntel
    ? htmlTable(
        ["Metric", "Baseline", "CodeAtlas", "Intel"],
        [
          ["Avg score (0-2)", fmt(baseAvgScore), fmt(catAvgScore), fmt(intelAvgScore)],
          [
            "Correct",
            String(countStatus(baseEvals, "correct")),
            String(countStatus(catEvals, "correct")),
            String(countStatus(intelEvals, "correct")),
          ],
          [
            "Partial",
            String(countStatus(baseEvals, "partially_correct")),
            String(countStatus(catEvals, "partially_correct")),
            String(countStatus(intelEvals, "partially_correct")),
          ],
          [
            "Incorrect",
            String(countStatus(baseEvals, "incorrect")),
            String(countStatus(catEvals, "incorrect")),
            String(countStatus(intelEvals, "incorrect")),
          ],
          [
            "Failed",
            String(countStatus(baseEvals, "failed")),
            String(countStatus(catEvals, "failed")),
            String(countStatus(intelEvals, "failed")),
          ],
        ],
      )
    : htmlTable(
        ["Metric", "Baseline", "CodeAtlas", "Delta"],
        [
          ["Avg score (0-2)", fmt(baseAvgScore), fmt(catAvgScore), fmt(catAvgScore - baseAvgScore)],
          [
            "Correct",
            String(countStatus(baseEvals, "correct")),
            String(countStatus(catEvals, "correct")),
            "—",
          ],
          [
            "Partial",
            String(countStatus(baseEvals, "partially_correct")),
            String(countStatus(catEvals, "partially_correct")),
            "—",
          ],
          [
            "Incorrect",
            String(countStatus(baseEvals, "incorrect")),
            String(countStatus(catEvals, "incorrect")),
            "—",
          ],
          [
            "Failed",
            String(countStatus(baseEvals, "failed")),
            String(countStatus(catEvals, "failed")),
            "—",
          ],
        ],
      )
}
<h2>Task Results</h2>
${htmlTable(
  hasIntel
    ? ["ID", "Category", "Score (B/C/I)", "Tokens (B/C/I)", "Duration (B/C/I)", "Tools (C/I)"]
    : ["ID", "Category", "Score (B/C)", "Tokens (B/C)", "Duration (B/C)", "Tools (C)"],
  taskRows,
)}
</body>
</html>
`;

  return {
    suiteId: data.suiteId,
    content: html,
    format: "html",
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Phase A — Attribution Ledger
// ---------------------------------------------------------------------------

function renderAttributionLedger(
  baseline: readonly BenchmarkTaskResult[],
  codeatlas: readonly BenchmarkTaskResult[],
  intel: readonly BenchmarkTaskResult[],
): string[] {
  const lines: string[] = [];
  const hasIntel = intel.length > 0;

  lines.push("## Phase A — Attribution Ledger");
  lines.push("");

  const metrics = [
    "total_tokens",
    "system_prompt_tokens",
    "repository_context_tokens",
    "tool_output_tokens",
    "repeated_context_tokens",
    "unique_context_tokens",
    "duplicate_context_percent",
    "agent_message_tokens",
    "reasoning_tokens",
    "final_answer_input_tokens",
    "final_answer_output_tokens",
    "llm_call_count",
    "tool_call_count",
    "latency_ms",
    "cache_read_tokens",
    "cache_write_tokens",
  ] as const;

  const metricLabels: Record<string, string> = {
    total_tokens: "Total tokens",
    system_prompt_tokens: "System prompt tokens",
    repository_context_tokens: "Repo context tokens",
    tool_output_tokens: "Tool output tokens",
    repeated_context_tokens: "Repeated context tokens",
    unique_context_tokens: "Unique context tokens",
    duplicate_context_percent: "Duplicate context %",
    agent_message_tokens: "Agent message tokens",
    reasoning_tokens: "Reasoning tokens",
    final_answer_input_tokens: "Final answer input tokens",
    final_answer_output_tokens: "Final answer output tokens",
    llm_call_count: "LLM call count",
    tool_call_count: "Tool call count",
    latency_ms: "Latency (ms)",
    cache_read_tokens: "Cache read tokens",
    cache_write_tokens: "Cache write tokens",
  };

  if (hasIntel) {
    lines.push("| Metric | Baseline | CodeAtlas | CodeAtlas Intel |");
    lines.push("|--------|----------|-----------|-----------------|");
  } else {
    lines.push("| Metric | Baseline | CodeAtlas |");
    lines.push("|--------|----------|-----------|");
  }

  for (const metric of metrics) {
    const bVal = aggregateMetric(baseline, metric);
    const cVal = aggregateMetric(codeatlas, metric);
    const iVal = hasIntel ? aggregateMetric(intel, metric) : null;

    const label = metricLabels[metric] ?? metric;
    const bStr = formatMetricValue(metric, bVal);
    const cStr = formatMetricValue(metric, cVal);
    const iStr = iVal !== null ? formatMetricValue(metric, iVal) : undefined;

    if (hasIntel && iStr !== undefined) {
      lines.push(`| ${label} | ${bStr} | ${cStr} | ${iStr} |`);
    } else {
      lines.push(`| ${label} | ${bStr} | ${cStr} |`);
    }
  }
  lines.push("");

  return lines;
}

function aggregateMetric(
  tasks: readonly BenchmarkTaskResult[],
  metric: string,
): { value: number | null; status: string } {
  let totalValue = 0;
  let anyMeasured = false;
  let anyUnavailable = false;

  for (const task of tasks) {
    const obs = task.observability;
    if (obs === undefined) continue;
    const mv = obs.metrics[metric as keyof typeof obs.metrics];
    if (mv === undefined || mv === null) continue;
    if (mv.status === "measured" && mv.value !== null) {
      totalValue += mv.value;
      anyMeasured = true;
    } else if (mv.status === "unavailable") {
      anyUnavailable = true;
    }
  }

  if (anyMeasured) return { value: totalValue, status: "measured" };
  if (anyUnavailable) return { value: null, status: "unavailable" };
  return { value: null, status: "not_instrumented" };
}

function formatMetricValue(metric: string, agg: { value: number | null; status: string }): string {
  if (agg.status === "unavailable") return "UNAVAILABLE";
  if (agg.status === "not_instrumented" || agg.value === null) return "NOT INSTRUMENTED";
  if (metric === "duplicate_context_percent") return pct(agg.value);
  if (metric === "latency_ms") return fmtMs(agg.value);
  return fmtTokens(Math.round(agg.value));
}

// ---------------------------------------------------------------------------
// Phase A — Failure Classification
// ---------------------------------------------------------------------------

const FAILURE_LABELS: Record<FailureCategory, string> = {
  budget_truncation: "Budget Truncation",
  lexical_miss: "Lexical Miss",
  context_overload: "Context Overload",
  tool_loop_underuse: "Tool Loop Underuse",
  insufficient_signal: "Insufficient Signal",
};

function renderFailureClassification(tasks: readonly BenchmarkTaskResult[]): string[] {
  const lines: string[] = [];

  const classified = tasks.filter((t) => t.failureClassification !== undefined);
  if (classified.length === 0) return lines;

  lines.push("## Phase A — Failure Classification");
  lines.push("");
  lines.push("| Task | Mode | Category | Reason | Proposed Fix |");
  lines.push("|------|------|----------|--------|--------------|");

  for (const task of classified) {
    const fc = task.failureClassification;
    if (!fc) continue;
    lines.push(
      `| ${task.taskId} | ${task.mode} | ${FAILURE_LABELS[fc.category] ?? fc.category} | ${truncateCell(fc.reason, 80)} | ${truncateCell(fc.proposedFix, 60)} |`,
    );
  }
  lines.push("");

  // Aggregate table
  const aggregate: Record<FailureCategory, number> = {
    budget_truncation: 0,
    lexical_miss: 0,
    context_overload: 0,
    tool_loop_underuse: 0,
    insufficient_signal: 0,
  };
  for (const task of classified) {
    const fc = task.failureClassification;
    if (!fc) continue;
    aggregate[fc.category] += 1;
  }

  lines.push("### Failure Aggregate");
  lines.push("");
  lines.push("| Category | Count | % of Failures |");
  lines.push("|----------|-------|---------------|");
  for (const [cat, count] of Object.entries(aggregate) as [FailureCategory, number][]) {
    if (count === 0) continue;
    const pctStr = classified.length > 0 ? pct((count / classified.length) * 100) : "0%";
    lines.push(`| ${FAILURE_LABELS[cat]} | ${count} | ${pctStr} |`);
  }
  lines.push("");

  return lines;
}

function truncateCell(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

// ---------------------------------------------------------------------------
// Phase A — Duplicate Content Audit
// ---------------------------------------------------------------------------

function renderDuplicateAudit(
  baseline: readonly BenchmarkTaskResult[],
  codeatlas: readonly BenchmarkTaskResult[],
  intel: readonly BenchmarkTaskResult[],
): string[] {
  const lines: string[] = [];
  const hasIntel = intel.length > 0;

  // Check if any tasks have observability with duplicate data
  const allTasks = [...baseline, ...codeatlas, ...intel];
  const hasDuplicateData = allTasks.some(
    (t) =>
      t.observability?.duplicateBuckets !== undefined &&
      t.observability.duplicateBuckets.length > 0,
  );
  if (!hasDuplicateData) return lines;

  lines.push("## Phase A — Duplicate Content Audit");
  lines.push("");

  // Per-arm summary
  if (hasIntel) {
    lines.push("| Metric | Baseline | CodeAtlas | CodeAtlas Intel |");
    lines.push("|--------|----------|-----------|-----------------|");
  } else {
    lines.push("| Metric | Baseline | CodeAtlas |");
    lines.push("|--------|----------|-----------|");
  }

  const bRepeated = sumRepeatedFiles(baseline);
  const cRepeated = sumRepeatedFiles(codeatlas);
  const iRepeated = hasIntel ? sumRepeatedFiles(intel) : null;
  const bDupPct = avgDuplicatePercent(baseline);
  const cDupPct = avgDuplicatePercent(codeatlas);
  const iDupPct = hasIntel ? avgDuplicatePercent(intel) : null;
  const bDupTokens = sumDuplicateTokens(baseline);
  const cDupTokens = sumDuplicateTokens(codeatlas);
  const iDupTokens = hasIntel ? sumDuplicateTokens(intel) : null;

  if (hasIntel && iRepeated !== null && iDupPct !== null && iDupTokens !== null) {
    lines.push(`| Repeated file reads | ${bRepeated} | ${cRepeated} | ${iRepeated} |`);
    lines.push(`| Avg duplicate % | ${pct(bDupPct)} | ${pct(cDupPct)} | ${pct(iDupPct)} |`);
    lines.push(
      `| Total duplicate tokens | ${fmtTokens(bDupTokens)} | ${fmtTokens(cDupTokens)} | ${fmtTokens(iDupTokens)} |`,
    );
  } else {
    lines.push(`| Repeated file reads | ${bRepeated} | ${cRepeated} |`);
    lines.push(`| Avg duplicate % | ${pct(bDupPct)} | ${pct(cDupPct)} |`);
    lines.push(`| Total duplicate tokens | ${fmtTokens(bDupTokens)} | ${fmtTokens(cDupTokens)} |`);
  }
  lines.push("");

  // Per-bucket breakdown (aggregate across all codeatlas tasks)
  const bucketAggregate = aggregateDuplicateBuckets(codeatlas);
  if (bucketAggregate.length > 0) {
    lines.push("### Duplicate Attribution Buckets (CodeAtlas)");
    lines.push("");
    lines.push("| Source | Classification | Tokens | Count |");
    lines.push("|--------|---------------|--------|-------|");
    for (const b of bucketAggregate) {
      lines.push(`| ${b.source} | ${b.classification} | ${fmtTokens(b.tokens)} | ${b.count} |`);
    }
    lines.push("");
  }

  return lines;
}

function sumRepeatedFiles(tasks: readonly BenchmarkTaskResult[]): number {
  return tasks.reduce((sum, t) => sum + (t.observability?.repeatedFileCount ?? 0), 0);
}

function avgDuplicatePercent(tasks: readonly BenchmarkTaskResult[]): number {
  const pcts = tasks
    .map((t) => t.observability?.metrics?.duplicate_context_percent?.value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (pcts.length === 0) return 0;
  return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}

function sumDuplicateTokens(tasks: readonly BenchmarkTaskResult[]): number {
  return tasks.reduce(
    (sum, t) => sum + ((t.observability?.metrics?.repeated_context_tokens?.value as number) ?? 0),
    0,
  );
}

interface BucketAggregate {
  source: string;
  classification: string;
  tokens: number;
  count: number;
}

function aggregateDuplicateBuckets(tasks: readonly BenchmarkTaskResult[]): BucketAggregate[] {
  const map = new Map<string, BucketAggregate>();
  for (const task of tasks) {
    const buckets = task.observability?.duplicateBuckets;
    if (buckets === undefined) continue;
    for (const b of buckets) {
      const key = `${b.classification}:${b.source}`;
      const existing = map.get(key);
      if (existing !== undefined) {
        existing.tokens += b.tokens;
        existing.count += b.count;
      } else {
        map.set(key, {
          source: b.source,
          classification: b.classification,
          tokens: b.tokens,
          count: b.count,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.tokens - a.tokens);
}

// ---------------------------------------------------------------------------
// Phase A5 — Tool Loop Diagnostics
// ---------------------------------------------------------------------------

function renderToolLoopDiagnostics(
  _baseline: readonly BenchmarkTaskResult[],
  codeatlas: readonly BenchmarkTaskResult[],
  intel: readonly BenchmarkTaskResult[],
): string[] {
  const lines: string[] = [];
  const hasIntel = intel.length > 0;
  const codeatlasAll = [...codeatlas, ...intel];
  if (codeatlasAll.length === 0) return lines;

  lines.push("## Phase A5 — Tool Loop Diagnostics");
  lines.push("");

  const avgRounds = (tasks: readonly BenchmarkTaskResult[]): string => {
    const counts = tasks.map((t) => t.roundCount).filter((v): v is number => v !== undefined);
    return counts.length > 0 ? fmt(avg(counts)) : "N/A";
  };
  const avgDedupe = (tasks: readonly BenchmarkTaskResult[]): string => {
    const counts = tasks.map((t) => t.dedupeHitCount).filter((v): v is number => v !== undefined);
    return counts.length > 0 ? fmt(avg(counts)) : "N/A";
  };
  const stopReasonCounts = (tasks: readonly BenchmarkTaskResult[]): string => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      const sr = t.stopReason ?? "N/A";
      counts.set(sr, (counts.get(sr) ?? 0) + 1);
    }
    return [...counts.entries()].map(([k, v]) => `${k}: ${v}`).join(", ");
  };

  if (hasIntel) {
    lines.push("| Metric | Baseline | CodeAtlas | CodeAtlas Intel |");
    lines.push("|--------|----------|-----------|-----------------|");
  } else {
    lines.push("| Metric | Baseline | CodeAtlas |");
    lines.push("|--------|----------|-----------|");
  }
  lines.push(
    `| Avg rounds | N/A | ${avgRounds(codeatlas)} | ${hasIntel ? avgRounds(intel) : ""} |`,
  );
  lines.push(
    `| Avg dedup hits | N/A | ${avgDedupe(codeatlas)} | ${hasIntel ? avgDedupe(intel) : ""} |`,
  );
  lines.push(
    `| Stop reasons | N/A | ${stopReasonCounts(codeatlas)} | ${hasIntel ? stopReasonCounts(intel) : ""} |`,
  );
  lines.push("");

  return lines;
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
