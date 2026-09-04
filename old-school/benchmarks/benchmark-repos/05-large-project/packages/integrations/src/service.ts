import { Logger, Result, Ok, Err } from '@atlas/shared';

export abstract class IntegrationsService {
  protected logger: Logger;
  protected cache = new Map<string, { value: unknown; expiresAt: number }>();
  private metrics = { requests: 0, errors: 0, avgDuration: 0 };

  constructor(context: string) { this.logger = new Logger({ context }); }

  protected async execute<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now(); this.metrics.requests++;
    try {
      const r = await fn();
      const d = Date.now() - start;
      this.metrics.avgDuration = (this.metrics.avgDuration * (this.metrics.requests - 1) + d) / this.metrics.requests;
      return r;
    } catch (e) { this.metrics.errors++; this.logger.error('Failed ' + operation, e as Error); throw e; }
  }

  protected getCached(key: string): unknown | undefined {
    const e = this.cache.get(key);
    if (e && Date.now() < e.expiresAt) return e.value;
    this.cache.delete(key);
    return undefined;
  }

  protected setCache(key: string, value: unknown, ttl = 300000): void {
    this.cache.set(key, { value, expiresAt: Date.now() + ttl });
  }

  getMetrics() { return { ...this.metrics }; }
}