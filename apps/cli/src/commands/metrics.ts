import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { MetricsPort, MetricsSnapshot } from "@atlas/sdk";
import { createMetricsService, exportMetricsCsv, exportMetricsJson } from "@atlas/sdk";
import type { Command } from "commander";
import { metricsPath, resolveProjectRoot } from "./search";

export { metricsPath } from "./search";

/** Render a compact number with K/M suffixes. */
function compactNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return String(n);
}

/** Render the `atlas metrics` summary. */
export function renderMetricsSummary(snap: MetricsSnapshot): string {
  const repo = snap.repository;
  const tokens = snap.tokens;
  const activity = snap.activity;
  const lines = [
    "",
    "  CodeAtlas Usage",
    "",
    `  Repository:                ${repo.name}`,
    `  Files:                     ${repo.files}`,
    `  Lines:                     ${compactNumber(repo.lines)}`,
    `  Symbols:                   ${compactNumber(repo.symbols)}`,
    "",
    `  Scans:                     ${repo.scanCount}`,
    `  Searches:                  ${compactNumber(activity.searches)}`,
    `  Context requests:          ${compactNumber(activity.contextRequests)}`,
    `  MCP requests:              ${compactNumber(activity.mcpRequests)}`,
    `  Files read:                ${compactNumber(activity.filesRead)}`,
    `  Files modified:            ${compactNumber(activity.filesModified)}`,
    "",
    "  Token Efficiency (estimated)",
    "",
    `  Estimated baseline:        ${compactNumber(tokens.estimatedBaseline)}`,
    `  CodeAtlas context:         ${compactNumber(tokens.estimatedCodeatlas)}`,
    `  Estimated saved:           ${compactNumber(tokens.estimatedSaved)}`,
    `  Savings:                   ${tokens.savingsPercent}%`,
    "",
    "  Performance (avg)",
    "",
    `  Scan:                      ${snap.performance.averageScanMs}ms`,
    `  Search:                    ${snap.performance.averageSearchMs}ms`,
    `  Context:                   ${snap.performance.averageContextMs}ms`,
    "",
  ];
  return lines.join("\n");
}

export function registerMetrics(program: Command): void {
  const metrics = program
    .command("metrics")
    .description("Show local usage & token analytics metrics");

  metrics
    .command("show")
    .description("Show metrics summary")
    .option("--json", "print results as JSON")
    .action(async (options: { json?: boolean }) => {
      await showMetrics(options);
    });

  metrics
    .command("export")
    .description("Export metrics to a file")
    .option("-o, --output <path>", "output file path (default: codeatlas-metrics.json)")
    .option("--csv", "export as CSV (daily history only)")
    .action(async (options: { output?: string; csv?: boolean }) => {
      await exportMetrics(options);
    });

  metrics
    .command("reset")
    .description("Reset all metrics (clears .codeatlas/metrics.json)")
    .option("--yes", "skip confirmation")
    .action(async (options: { yes?: boolean }) => {
      await resetMetrics(options);
    });

  // Bare `atlas metrics` prints the summary, mirroring `atlas metrics show`.
  metrics.action(() => {
    return showMetrics({});
  });
}

function withMetrics(fn: (metrics: MetricsPort) => void): void {
  const root = resolveProjectRoot();
  const svc = openMetrics(root);
  try {
    fn(svc);
  } finally {
    svc.close();
  }
}

/**
 * Open a metrics service for a project root, creating `.codeatlas/` if needed.
 * Used by the metrics commands and by other commands to record activity.
 */
export function openMetrics(root: string): MetricsPort {
  const mPath = metricsPath(root);
  mkdirSync(dirname(mPath), { recursive: true });
  return createMetricsService({ filePath: mPath });
}

async function showMetrics(options: { json?: boolean }): Promise<void> {
  withMetrics((svc) => {
    const snap = svc.snapshot();
    if (options.json === true) {
      console.log(JSON.stringify(snap, null, 2));
      return;
    }
    console.log(renderMetricsSummary(snap));
  });
}

async function exportMetrics(options: { output?: string; csv?: boolean }): Promise<void> {
  withMetrics((svc) => {
    const snap = svc.snapshot();
    const outputPath =
      options.output ?? (options.csv === true ? "codeatlas-metrics.csv" : "codeatlas-metrics.json");
    if (options.csv === true) {
      exportMetricsCsv(snap, { outputPath });
      console.log(`Metrics exported to ${outputPath} (CSV)`);
    } else {
      exportMetricsJson(snap, { outputPath });
      console.log(`Metrics exported to ${outputPath}`);
    }
  });
}

async function resetMetrics(options: { yes?: boolean }): Promise<void> {
  if (options.yes !== true) {
    console.log("This will delete all collected metrics.");
    console.log("Use --yes to confirm.");
    return;
  }
  withMetrics((svc) => {
    svc.reset();
    console.log("Metrics reset.");
  });
}
