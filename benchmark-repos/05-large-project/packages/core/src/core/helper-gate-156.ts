import { Result, Ok, Err, Logger } from '@atlas/shared';

export interface Config156 {
  enabled: boolean;
  priority: number;
  timeout: number;
  retries: number;
  cacheResults: boolean;
  cacheTTL: number;
  metadata: Record<string, unknown>;
}

export interface Context156 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

export class GateHelper156 {
  private config: Config156;
  private logger: Logger;
  private cache = new Map<string, { value: unknown; expiresAt: number }>();
  private hooks = new Map<string, Array<(...args: unknown[]) => Promise<unknown>>>();

  constructor(config?: Partial<Config156>) {
    this.config = { enabled: true, priority: 0, timeout: 30000, retries: 3, cacheResults: true, cacheTTL: 300000, metadata: {}, ...config };
    this.logger = new Logger({ context: 'GateHelper156' });
  }

  async execute(ctx: Context156, fn: () => Promise<unknown>): Promise<Result<unknown>> {
    if (!this.config.enabled) return Ok(undefined);
    const start = Date.now();
    try {
      this.logger.debug('Executing');
      await this.runHooks('before', ctx);
      const result = await Promise.race([fn(), this.timeoutPromise()]);
      await this.runHooks('after', ctx);
      this.logger.debug('Completed', { duration: Date.now() - start });
      return Ok(result);
    } catch (error) {
      this.logger.error('Failed', error as Error);
      await this.runHooks('error', ctx, error);
      return Err(error as Error);
    }
  }

  async executeWithRetry(ctx: Context156, fn: () => Promise<unknown>): Promise<Result<unknown>> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      const result = await this.execute(ctx, fn);
      if (result.ok) return result;
      lastErr = result.error as Error;
      if (attempt < this.config.retries) {
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 30000)));
      }
    }
    return Err(lastErr!);
  }

  getCached(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.cache.delete(key); return undefined; }
    return entry.value;
  }

  setCache(key: string, value: unknown): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.config.cacheTTL });
  }

  private async runHooks(phase: string, ctx: Context156, error?: unknown): Promise<void> {
    for (const hook of (this.hooks.get(phase) ?? [])) {
      try { await hook(ctx, error); } catch {}
    }
  }

  private timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.config.timeout));
  }

  on(phase: string, hook: (...args: unknown[]) => Promise<unknown>): () => void {
    if (!this.hooks.has(phase)) this.hooks.set(phase, []);
    this.hooks.get(phase)!.push(hook);
    return () => { const h = this.hooks.get(phase)!; const idx = h.indexOf(hook); if (idx >= 0) h.splice(idx, 1); };
  }

  getConfig(): Config156 { return { ...this.config }; }
  setEnabled(enabled: boolean): void { this.config.enabled = enabled; }
}