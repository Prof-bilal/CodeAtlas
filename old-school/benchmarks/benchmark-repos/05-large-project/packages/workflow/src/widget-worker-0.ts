import { Result, Ok, Err, Logger } from '@atlas/shared';

const logger = new Logger({ context: 'Workflow.WidgetWorker0' });

export interface Config0 {
  enabled: boolean;
  timeout: number;
  retries: number;
  batchSize: number;
  cacheTTL: number;
  metadata: Record<string, unknown>;
}

export class WidgetWorker0 {
  private config: Config0;
  private cache = new Map<string, { value: unknown; expiresAt: number }>();
  private metrics = { requests: 0, errors: 0, avgDuration: 0 };

  constructor(config?: Partial<Config0>) {
    this.config = { enabled: true, timeout: 30000, retries: 3, batchSize: 100, cacheTTL: 300000, metadata: {}, ...config };
  }

  async execute(input: { id?: string; operation: string; data: Record<string, unknown> }): Promise<Result<unknown>> {
    if (!this.config.enabled) return Ok({ disabled: true });
    this.metrics.requests++;
    const start = Date.now();
    try {
      const cacheKey = input.operation + ':' + (input.id ?? 'all');
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) return Ok(cached.value);

      logger.debug('Executing ' + input.operation);
      const result = await this.process(input);
      
      if (this.config.cacheTTL > 0) {
        this.cache.set(cacheKey, { value: result, expiresAt: Date.now() + this.config.cacheTTL });
      }

      const duration = Date.now() - start;
      this.metrics.avgDuration = (this.metrics.avgDuration * (this.metrics.requests - 1) + duration) / this.metrics.requests;
      return Ok(result);
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed', error as Error);
      return Err(error as Error);
    }
  }

  private async process(input: { id?: string; operation: string; data: Record<string, unknown> }): Promise<unknown> {
    await new Promise(r => setTimeout(r, Math.random() * 5));
    return {
      processed: true,
      operation: input.operation,
      id: input.id,
      timestamp: new Date().toISOString(),
      metadata: this.config.metadata,
    };
  }

  async processBatch(items: Array<{ id: string; operation: string; data: Record<string, unknown> }>): Promise<Result<{ successful: number; failed: number; duration: number }>> {
    const start = Date.now();
    let successful = 0;
    let failed = 0;
    const chunks: typeof items[] = [];
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      chunks.push(items.slice(i, i + this.config.batchSize));
    }
    for (const chunk of chunks) {
      const results = await Promise.allSettled(chunk.map(item => this.execute(item)));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) successful++;
        else failed++;
      }
    }
    return Ok({ successful, failed, duration: Date.now() - start });
  }

  async invalidateCache(pattern?: string): Promise<number> {
    if (!pattern) { this.cache.clear(); return 0; }
    let count = 0;
    for (const key of this.cache.keys()) { if (key.includes(pattern)) { this.cache.delete(key); count++; } }
    return count;
  }

  getStats() { return { ...this.metrics, cacheSize: this.cache.size, enabled: this.config.enabled }; }
  setEnabled(enabled: boolean): void { this.config.enabled = enabled; }
  setCacheTTL(ttl: number): void { this.config.cacheTTL = ttl; }
}