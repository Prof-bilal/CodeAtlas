import type { MetricsDay, MetricsSnapshot } from "@atlas/core";

/**
 * Metrics JSON schema version — incremented on breaking changes.
 * The store handles migration from older versions.
 */
export const METRICS_SCHEMA_VERSION = 1;

/** The metrics file name inside `.codeatlas/`. */
export const METRICS_FILE_NAME = "metrics.json";

/** Maximum number of daily entries to retain (rolling window). */
export const MAX_DAILY_ENTRIES = 90;

/** Metrics file size limit (1 MiB). */
export const MAX_METRICS_FILE_SIZE = 1_048_576;

/**
 * Build an empty metrics snapshot with the given repository name.
 * Used for first-time initialization.
 */
export function createEmptySnapshot(repositoryName: string): MetricsSnapshot {
  const now = new Date().toISOString();
  return {
    version: METRICS_SCHEMA_VERSION,
    generatedAt: now,
    repository: {
      name: repositoryName,
      files: 0,
      lines: 0,
      symbols: 0,
      dependencies: 0,
      languages: {},
      scanCount: 0,
      firstScanAt: null,
      latestScanAt: null,
    },
    activity: {
      scans: 0,
      searches: 0,
      contextRequests: 0,
      mcpRequests: 0,
      filesRead: 0,
      filesModified: 0,
    },
    tokens: {
      estimatedBaseline: 0,
      estimatedCodeatlas: 0,
      estimatedSaved: 0,
      savingsPercent: 0,
    },
    performance: {
      averageScanMs: 0,
      averageSearchMs: 0,
      averageContextMs: 0,
    },
    daily: [],
  };
}

/** Validate a parsed JSON object conforms to the expected snapshot shape. */
export function validateSnapshot(data: unknown): data is MetricsSnapshot {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj["version"] !== "number") return false;
  if (typeof obj["generatedAt"] !== "string") return false;
  if (typeof obj["repository"] !== "object" || obj["repository"] === null) return false;
  if (typeof obj["activity"] !== "object" || obj["activity"] === null) return false;
  if (typeof obj["tokens"] !== "object" || obj["tokens"] === null) return false;
  if (typeof obj["performance"] !== "object" || obj["performance"] === null) return false;
  if (!Array.isArray(obj["daily"])) return false;
  return true;
}

/** Return today's date as YYYY-MM-DD. */
export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Get or create today's daily entry from the daily array. */
export function getOrCreateDay(
  daily: MetricsDay[],
  date: string = todayString(),
): { day: MetricsDay; index: number } {
  const existing = daily.findIndex((d) => d.date === date);
  if (existing >= 0) {
    return { day: daily[existing], index: existing };
  }
  const fresh: MetricsDay = {
    date,
    scans: 0,
    searches: 0,
    contextRequests: 0,
    mcpRequests: 0,
    filesRead: 0,
    filesModified: 0,
    tokensUsed: 0,
    estimatedBaselineTokens: 0,
    estimatedTokensSaved: 0,
  };
  return { day: fresh, index: -1 };
}
