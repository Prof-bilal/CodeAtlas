/**
 * MetricsExporter — export metrics to JSON or CSV.
 *
 * The exported file contains metrics only — never source code, API keys,
 * prompts, or secrets.
 */
import { writeFileSync } from "node:fs";
import type { MetricsSnapshot } from "@atlas/core";

export interface ExportOptions {
  /** Output file path. Defaults to `codeatlas-metrics.json` in the current directory. */
  readonly outputPath?: string;
}

/**
 * Export a metrics snapshot as JSON.
 * Returns the JSON string and optionally writes to a file.
 */
export function exportJson(snapshot: MetricsSnapshot, options: ExportOptions = {}): string {
  const json = JSON.stringify(snapshot, null, 2);
  if (options.outputPath !== undefined) {
    writeFileSync(options.outputPath, json, "utf-8");
  }
  return json;
}

/**
 * Export a metrics snapshot as CSV (daily history only).
 * Returns the CSV string and optionally writes to a file.
 */
export function exportCsv(snapshot: MetricsSnapshot, options: ExportOptions = {}): string {
  const headers = [
    "date",
    "scans",
    "searches",
    "contextRequests",
    "mcpRequests",
    "filesRead",
    "filesModified",
    "tokensUsed",
    "estimatedBaselineTokens",
    "estimatedTokensSaved",
  ];
  const rows: string[] = [headers.join(",")];
  for (const day of snapshot.daily) {
    rows.push(
      [
        day.date,
        day.scans,
        day.searches,
        day.contextRequests,
        day.mcpRequests,
        day.filesRead,
        day.filesModified,
        day.tokensUsed,
        day.estimatedBaselineTokens,
        day.estimatedTokensSaved,
      ].join(","),
    );
  }
  const csv = rows.join("\n");
  if (options.outputPath !== undefined) {
    writeFileSync(options.outputPath, csv, "utf-8");
  }
  return csv;
}
