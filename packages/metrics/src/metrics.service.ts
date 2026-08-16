/**
 * MetricsService — implements MetricsPort.
 *
 * Coordinates the metrics store, event recording, daily aggregation,
 * and token estimation. All mutations are persisted atomically.
 */
import type {
  MetricsContextEvent,
  MetricsDay,
  MetricsFileEvent,
  MetricsMcpEvent,
  MetricsPort,
  MetricsScanEvent,
  MetricsSearchEvent,
  MetricsSnapshot,
  MetricsTokenEvent,
} from "@atlas/core";
import { MetricsStore } from "./metrics-store";
import { calculateSavings } from "./token-estimation";
import { MAX_DAILY_ENTRIES, createEmptySnapshot, getOrCreateDay, todayString } from "./types";

export interface MetricsServiceOptions {
  /** Path to the metrics JSON file. */
  readonly filePath: string;
  /** Inject a store for tests. */
  readonly store?: MetricsStore;
}

export class MetricsService implements MetricsPort {
  private readonly store: MetricsStore;

  constructor(options?: MetricsServiceOptions) {
    this.store =
      options?.store ??
      new MetricsStore(
        options?.filePath !== undefined ? { filePath: options.filePath } : undefined,
      );
  }

  snapshot(): MetricsSnapshot {
    return this.store.getSnapshot();
  }

  recordScan(event: MetricsScanEvent): void {
    const snap = this.loadMutable();
    const repo = snap.repository;
    repo.files = event.files;
    repo.lines = event.lines;
    repo.symbols = event.symbols;
    repo.dependencies = event.dependencies;
    repo.languages = { ...event.languages };
    repo.scanCount += 1;
    const now = new Date().toISOString();
    if (repo.firstScanAt === null) {
      repo.firstScanAt = now;
    }
    repo.latestScanAt = now;

    snap.activity.scans += 1;

    this.updatePerformance(snap.performance, "scan", event.latencyMs);
    this.updateDay("scans", 1);
    this.store.save(snap);
  }

  recordSearch(event: MetricsSearchEvent): void {
    const snap = this.loadMutable();
    snap.activity.searches += 1;
    if (event.latencyMs !== undefined) {
      this.updatePerformance(snap.performance, "search", event.latencyMs);
    }
    this.updateDay("searches", 1);
    this.store.save(snap);
  }

  recordContextRequest(event: MetricsContextEvent): void {
    const snap = this.loadMutable();
    snap.activity.contextRequests += 1;
    if (event.latencyMs !== undefined) {
      this.updatePerformance(snap.performance, "context", event.latencyMs);
    }
    this.updateDay("contextRequests", 1);
    this.store.save(snap);
  }

  recordMcpRequest(_event: MetricsMcpEvent): void {
    const snap = this.loadMutable();
    snap.activity.mcpRequests += 1;
    this.updateDay("mcpRequests", 1);
    this.store.save(snap);
  }

  recordFileRead(_event: MetricsFileEvent): void {
    const snap = this.loadMutable();
    snap.activity.filesRead += 1;
    this.updateDay("filesRead", 1);
    this.store.save(snap);
  }

  recordFileModified(_event: MetricsFileEvent): void {
    const snap = this.loadMutable();
    snap.activity.filesModified += 1;
    this.updateDay("filesModified", 1);
    this.store.save(snap);
  }

  recordTokenEstimate(event: MetricsTokenEvent): void {
    const snap = this.loadMutable();
    const tokens = snap.tokens;
    tokens.estimatedBaseline += event.baselineTokens;
    tokens.estimatedCodeatlas += event.codeatlasTokens;
    const { saved, percent } = calculateSavings(
      tokens.estimatedBaseline,
      tokens.estimatedCodeatlas,
    );
    tokens.estimatedSaved = saved;
    tokens.savingsPercent = percent;

    this.updateDay("tokensUsed", event.codeatlasTokens);
    this.updateDay("estimatedBaselineTokens", event.baselineTokens);
    this.updateDay("estimatedTokensSaved", saved);

    this.store.save(snap);
  }

  flush(): void {
    const snap = this.loadMutable();
    this.store.save(snap);
  }

  reset(): void {
    const snap = this.loadMutable();
    const repoName = snap.repository.name;
    const fresh = createEmptySnapshot(repoName);
    this.store.save(fresh);
  }

  close(): void {
    // No-op for JSON store (no SQLite handle).
  }

  private loadMutable(): MutableSnapshot {
    return this.store.getSnapshot() as unknown as MutableSnapshot;
  }

  private updatePerformance(
    perf: MutablePerformance,
    field: "scan" | "search" | "context",
    latencyMs: number,
  ): void {
    const key =
      field === "scan"
        ? "averageScanMs"
        : field === "search"
          ? "averageSearchMs"
          : "averageContextMs";
    const current = perf[key];
    // Exponential moving average with alpha = 0.3
    if (current === 0) {
      perf[key] = latencyMs;
    } else {
      perf[key] = Math.round(current * 0.7 + latencyMs * 0.3);
    }
  }

  private updateDay(field: keyof MetricsDay, value: number): void {
    const snap = this.loadMutable();
    const date = todayString();
    const { day, index } = getOrCreateDay(snap.daily as MetricsDay[], date);

    const mutableDay = day as unknown as Record<string, number>;
    mutableDay[field] = (mutableDay[field] ?? 0) + value;

    if (index < 0) {
      snap.daily.push(day);
    }

    // Trim old entries beyond the rolling window
    while (snap.daily.length > MAX_DAILY_ENTRIES) {
      snap.daily.shift();
    }
  }
}

// Mutable helper types for internal mutation
interface MutableSnapshot {
  version: number;
  generatedAt: string;
  repository: MutableRepository;
  activity: MutableActivity;
  tokens: MutableTokens;
  performance: MutablePerformance;
  daily: MetricsDay[];
}

interface MutableRepository {
  name: string;
  files: number;
  lines: number;
  symbols: number;
  dependencies: number;
  languages: Record<string, number>;
  scanCount: number;
  firstScanAt: string | null;
  latestScanAt: string | null;
}

interface MutableActivity {
  scans: number;
  searches: number;
  contextRequests: number;
  mcpRequests: number;
  filesRead: number;
  filesModified: number;
}

interface MutableTokens {
  estimatedBaseline: number;
  estimatedCodeatlas: number;
  estimatedSaved: number;
  savingsPercent: number;
}

interface MutablePerformance {
  averageScanMs: number;
  averageSearchMs: number;
  averageContextMs: number;
}
