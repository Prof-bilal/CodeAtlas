/**
 * Metrics / Token Analytics contract (local-first usage tracking).
 *
 * Collects, persists, and exports repository activity and estimated token
 * savings metrics. All data stays local in `.codeatlas/metrics.json`.
 *
 * Privacy: records never contain source code, API keys, prompts, or
 * secrets. Repository name may be stored; path anonymization is supported.
 */
export interface MetricsPort {
  /** Read the current metrics snapshot (loads from disk if available). */
  snapshot(): MetricsSnapshot;
  /** Record a scan operation and update repository metrics. */
  recordScan(event: MetricsScanEvent): void;
  /** Record a search operation. */
  recordSearch(event: MetricsSearchEvent): void;
  /** Record a context retrieval request. */
  recordContextRequest(event: MetricsContextEvent): void;
  /** Record an MCP tool request. */
  recordMcpRequest(event: MetricsMcpEvent): void;
  /** Record a file read operation. */
  recordFileRead(event: MetricsFileEvent): void;
  /** Record a file modification (when detectable). */
  recordFileModified(event: MetricsFileEvent): void;
  /** Update token estimates for a context operation. */
  recordTokenEstimate(event: MetricsTokenEvent): void;
  /** Persist the current state to disk. */
  flush(): void;
  /** Reset all metrics (with confirmation). */
  reset(): void;
  /** Close the store. */
  close(): void;
}

/** A full metrics snapshot (the JSON schema root). */
export interface MetricsSnapshot {
  readonly version: number;
  readonly generatedAt: string;
  readonly repository: MetricsRepository;
  readonly activity: MetricsActivity;
  readonly tokens: MetricsTokens;
  readonly performance: MetricsPerformance;
  readonly daily: readonly MetricsDay[];
}

/** Repository-level metadata. */
export interface MetricsRepository {
  readonly name: string;
  readonly files: number;
  readonly lines: number;
  readonly symbols: number;
  readonly dependencies: number;
  readonly languages: Readonly<Record<string, number>>;
  readonly scanCount: number;
  readonly firstScanAt: string | null;
  readonly latestScanAt: string | null;
}

/** Cumulative activity counters. */
export interface MetricsActivity {
  readonly scans: number;
  readonly searches: number;
  readonly contextRequests: number;
  readonly mcpRequests: number;
  readonly filesRead: number;
  readonly filesModified: number;
}

/** Estimated token usage and savings. */
export interface MetricsTokens {
  readonly estimatedBaseline: number;
  readonly estimatedCodeatlas: number;
  readonly estimatedSaved: number;
  readonly savingsPercent: number;
}

/** Performance latency averages. */
export interface MetricsPerformance {
  readonly averageScanMs: number;
  readonly averageSearchMs: number;
  readonly averageContextMs: number;
}

/** One day's aggregated activity. */
export interface MetricsDay {
  readonly date: string;
  readonly scans: number;
  readonly searches: number;
  readonly contextRequests: number;
  readonly mcpRequests: number;
  readonly filesRead: number;
  readonly filesModified: number;
  readonly tokensUsed: number;
  readonly estimatedBaselineTokens: number;
  readonly estimatedTokensSaved: number;
}

/** A scan event to record. */
export interface MetricsScanEvent {
  readonly files: number;
  readonly lines: number;
  readonly symbols: number;
  readonly dependencies: number;
  readonly languages: Readonly<Record<string, number>>;
  readonly repositoryName?: string;
  readonly latencyMs: number;
}

/** A search event to record. */
export interface MetricsSearchEvent {
  readonly latencyMs?: number;
}

/** A context request event to record. */
export interface MetricsContextEvent {
  readonly estimatedTokens?: number;
  readonly latencyMs?: number;
}

/** An MCP request event to record. */
export interface MetricsMcpEvent {
  readonly latencyMs?: number;
}

/** A file read/modify event to record. */
export interface MetricsFileEvent {
  readonly filePath?: string;
}

/** A token estimate event to record. */
export interface MetricsTokenEvent {
  readonly baselineTokens: number;
  readonly codeatlasTokens: number;
}
