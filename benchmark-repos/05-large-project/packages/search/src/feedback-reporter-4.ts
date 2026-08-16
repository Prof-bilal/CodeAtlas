import { Result, Ok, Err, Logger } from '@atlas/shared';

const logger = new Logger({ context: 'Search.FeedbackReporter4' });

interface Config4 {
  enabled: boolean;
  batchSize: number;
  concurrency: number;
  timeout: number;
  retries: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  queueEnabled: boolean;
  queueConcurrency: number;
  metadata: Record<string, unknown>;
}

export class FeedbackReporter4 {
  private config: Config4;
  private cache = new Map<string, { value: unknown; expiresAt: number; hits: number }>();
  private metrics = {
    requests: 0,
    errors: 0,
    avgDuration: 0,
    cacheHits: 0,
    cacheMisses: 0,
    queueSize: 0,
    processed: 0,
    failed: 0,
  };
  private queue: Array<{ id: string; payload: unknown; priority: number; attempts: number }> = [];
  private running = false;

  constructor(config?: Partial<Config4>) {
    this.config = {
      enabled: true,
      batchSize: 100,
      concurrency: 10,
      timeout: 30000,
      retries: 3,
      cacheEnabled: true,
      cacheTTL: 300000,
      queueEnabled: true,
      queueConcurrency: 5,
      metadata: {},
      ...config,
    };
  }

  async execute(input: { id?: string; operation: string; data: Record<string, unknown>; priority?: number }): Promise<Result<unknown>> {
    if (!this.config.enabled) return Ok({ disabled: true });
    this.metrics.requests++;
    const start = Date.now();

    if (this.config.cacheEnabled) {
      const cacheKey = this.getCacheKey(input);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        this.metrics.cacheHits++;
        return Ok(cached.value);
      }
      this.metrics.cacheMisses++;
    }

    try {
      if (this.config.queueEnabled && input.priority && input.priority > 5) {
        this.enqueue(input);
        return Ok({ queued: true, id: input.id });
      }
      
      const result = await this.processWithRetry(input);
      
      if (this.config.cacheEnabled) {
        this.setCache(this.getCacheKey(input), result);
      }
      
      const duration = Date.now() - start;
      this.metrics.avgDuration = (this.metrics.avgDuration * (this.metrics.requests - 1) + duration) / this.metrics.requests;
      this.metrics.processed++;
      
      return Ok(result);
    } catch (error) {
      this.metrics.errors++;
      this.metrics.failed++;
      logger.error('Failed', error as Error);
      return Err(error as Error);
    }
  }

  private async processWithRetry(input: { id?: string; operation: string; data: Record<string, unknown> }): Promise<unknown> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        return await this.process(input);
      } catch (error) {
        lastErr = error as Error;
        if (attempt < this.config.retries) {
          await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), this.config.timeout)));
        }
      }
    }
    throw lastErr!;
  }

  private async process(input: { id?: string; operation: string; data: Record<string, unknown> }): Promise<unknown> {
    await new Promise(r => setTimeout(r, Math.random() * 5));
    return {
      processed: true,
      operation: input.operation,
      id: input.id,
      timestamp: new Date().toISOString(),
    };
  }

  private enqueue(input: { id?: string; operation: string; data: Record<string, unknown>; priority?: number }): void {
    this.queue.push({
      id: input.id ?? Math.random().toString(36).substr(2, 9),
      payload: input,
      priority: input.priority ?? 0,
      attempts: 0,
    });
    this.queue.sort((a, b) => b.priority - a.priority);
    this.metrics.queueSize = this.queue.length;
  }

  async processQueue(): Promise<{ processed: number; failed: number }> {
    if (!this.running) return { processed: 0, failed: 0 };
    let processed = 0;
    let failed = 0;
    const batch = this.queue.splice(0, this.config.batchSize);
    const chunks: typeof batch[] = [];
    for (let i = 0; i < batch.length; i += this.config.concurrency) {
      chunks.push(batch.slice(i, i + this.config.concurrency));
    }
    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(item => this.process(item.payload as any))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') processed++;
        else failed++;
      }
    }
    this.metrics.processed += processed;
    this.metrics.failed += failed;
    this.metrics.queueSize = this.queue.length;
    return { processed, failed };
  }

  startQueue(): void { this.running = true; }
  stopQueue(): void { this.running = false; }

  private getCacheKey(input: { id?: string; operation: string }): string {
    return input.operation + ':' + (input.id ?? 'all');
  }

  private setCache(key: string, value: unknown): void {
    if (this.cache.size >= 10000) {
      let minHits = Infinity;
      let minKey = '';
      for (const [k, v] of this.cache) { if (v.hits < minHits) { minHits = v.hits; minKey = k; } }
      if (minKey) this.cache.delete(minKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.config.cacheTTL, hits: 0 });
  }

  async invalidateCache(pattern?: string): Promise<number> {
    if (!pattern) { this.cache.clear(); return 0; }
    let count = 0;
    for (const key of this.cache.keys()) { if (key.includes(pattern)) { this.cache.delete(key); count++; } }
    return count;
  }

  getMetrics() { return { ...this.metrics }; }
  getQueueSize(): number { return this.queue.length; }
  setEnabled(enabled: boolean): void { this.config.enabled = enabled; }
  setCacheTTL(ttl: number): void { this.config.cacheTTL = ttl; }
}