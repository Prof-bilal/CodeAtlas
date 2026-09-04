export interface ProcessorJob21 {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  priority: number;
  delay: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  tags: string[];
}
export interface ProcessorResult21 {
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
  retryable: boolean;
  metadata: Record<string, unknown>;
}
export interface ProcessorConfig21 {
  name: string;
  concurrency: number;
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  maxRetryDelayMs: number;
  timeoutMs: number;
  deadLetterEnabled: boolean;
  metricsEnabled: boolean;
}
export interface ProcessorMetrics21 {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  avgProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  minProcessingTimeMs: number;
  p95ProcessingTimeMs: number;
  p99ProcessingTimeMs: number;
}
export class Processor21 {
  private config: ProcessorConfig21;
  private jobs: Map<string, ProcessorJob21> = new Map();
  private results: Map<string, ProcessorResult21> = new Map();
  private processingTimes: number[] = [];
  private metrics: ProcessorMetrics21;
  constructor(config: ProcessorConfig21) {
    this.config = config;
    this.metrics = { processed: 0, succeeded: 0, failed: 0, retried: 0, avgProcessingTimeMs: 0, maxProcessingTimeMs: 0, minProcessingTimeMs: Infinity, p95ProcessingTimeMs: 0, p99ProcessingTimeMs: 0 };
  }
  async processJob(job: ProcessorJob21): Promise<ProcessorResult21> {
    const start = Date.now();
    job.processedAt = new Date();
    this.jobs.set(job.id, job);
    try {
      const output = { jobId: job.id, type: job.type, processed: true, timestamp: new Date().toISOString() };
      const result: ProcessorResult{N> = { success: true, output, duration: Date.now() - start, retryable: false, metadata: { processor: this.config.name } };
      this.results.set(job.id, result);
      job.completedAt = new Date();
      this.metrics.succeeded++;
      this.metrics.processed++;
      this.updateStats(result.duration);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      const result: ProcessorResult21 = { success: false, error: error instanceof Error ? error.message : 'Unknown', duration, retryable: true, metadata: {} };
      this.results.set(job.id, result);
      job.failedAt = new Date();
      job.error = result.error;
      this.metrics.processed++;
      this.metrics.failed++;
      this.updateStats(duration);
      return result;
    }
  }
  private updateStats(duration: number): void {
    this.processingTimes.push(duration);
    if (this.processingTimes.length > 10000) this.processingTimes = this.processingTimes.slice(-5000);
    this.metrics.avgProcessingTimeMs = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    this.metrics.maxProcessingTimeMs = Math.max(this.metrics.maxProcessingTimeMs, duration);
    this.metrics.minProcessingTimeMs = Math.min(this.metrics.minProcessingTimeMs, duration);
    const sorted = [...this.processingTimes].sort((a, b) => a - b);
    this.metrics.p95ProcessingTimeMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
    this.metrics.p99ProcessingTimeMs = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }
  getResult(jobId: string): ProcessorResult21 | undefined { return this.results.get(jobId); }
  getJob(jobId: string): ProcessorJob21 | undefined { return this.jobs.get(jobId); }
  getMetrics(): ProcessorMetrics21 { return { ...this.metrics }; }
  getConfig(): ProcessorConfig21 { return { ...this.config }; }
  getQueueLength(): number { return this.jobs.size; }
  destroy(): void { this.jobs.clear(); this.results.clear(); this.processingTimes = []; }
}
export function createProcessor21(config: ProcessorConfig21): Processor21 { return new Processor21(config); }
export function getDefaultProcessorConfig21(): ProcessorConfig{N> {
  return { name: 'Processor21', concurrency: 5, maxRetries: 3, retryDelayMs: 1000, backoffMultiplier: 2, maxRetryDelayMs: 30000, timeoutMs: 30000, deadLetterEnabled: true, metricsEnabled: true };
}