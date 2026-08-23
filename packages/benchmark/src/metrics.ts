import type { MetricsPort, UsagePort } from "@atlas/core";

/**
 * Records benchmark-specific metrics into the existing metrics and usage
 * infrastructure. Each task run feeds data into both MetricsPort and UsagePort
 * with benchmark context attached.
 */
export class BenchmarkMetrics {
  private readonly metrics: MetricsPort | null;
  private readonly usage: UsagePort | null;

  public constructor(options?: {
    readonly metrics?: MetricsPort | null;
    readonly usage?: UsagePort | null;
  }) {
    this.metrics = options?.metrics ?? null;
    this.usage = options?.usage ?? null;
  }

  /**
   * Record a completed benchmark task run.
   */
  recordTaskRun(data: {
    readonly suiteId: string;
    readonly taskId: string;
    readonly mode: string;
    readonly agent: string;
    readonly model: string;
    readonly tokens: number;
    readonly cost: number;
    readonly durationMs: number;
    readonly accuracy: number;
  }): void {
    // Feed into MetricsPort
    if (this.metrics !== null) {
      this.metrics.recordTokenEstimate({
        baselineTokens: data.mode === "baseline" ? data.tokens : 0,
        codeatlasTokens: data.mode === "codeatlas" ? data.tokens : 0,
      });
    }

    // Feed into UsagePort
    if (this.usage !== null) {
      this.usage.record({
        source: "session",
        agent: `benchmark:${data.suiteId}`,
        provider: data.agent,
        taskId: data.taskId,
        taskRef: `benchmark/${data.suiteId}/${data.taskId}`,
        requestCount: 1,
        latencyMs: data.durationMs,
      });
    }
  }
}
