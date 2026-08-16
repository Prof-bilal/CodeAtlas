import { Result, Ok, Err, Logger } from '@atlas/shared';

interface ConfigResolverConfig60 {
  enabled: boolean;
  windowMs: number;
  threshold: number;
  resetTimeout: number;
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  timeout: number;
  cacheSize: number;
  cacheTTL: number;
  batchSize: number;
  concurrency: number;
  metadata: Record<string, unknown>;
}

interface ConfigResolverState60 {
  status: 'idle' | 'active' | 'degraded' | 'failed';
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  circuitState: 'closed' | 'open' | 'half-open';
  retryCount: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number;
  errorRate: number;
}

export class ConfigResolver60 {
  private config: ConfigResolverConfig60;
  private state: ConfigResolverState60;
  private logger: Logger;
  private responseTimes: number[] = [];
  private cache = new Map<string, { value: unknown; expiresAt: number; hits: number }>();
  private circuitBreakerFailures = 0;
  private circuitBreakerLastFailure = 0;
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(config?: Partial<ConfigResolverConfig60>) {
    this.config = {
      enabled: true,
      windowMs: 60000,
      threshold: 5,
      resetTimeout: 30000,
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      timeout: 30000,
      cacheSize: 10000,
      cacheTTL: 300000,
      batchSize: 100,
      concurrency: 10,
      metadata: {},
      ...config,
    };
    this.state = {
      status: 'idle',
      failures: 0,
      successes: 0,
      totalRequests: 0,
      circuitState: 'closed',
      retryCount: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      throughput: 0,
      errorRate: 0,
    };
    this.logger = new Logger({ context: 'ConfigResolver60' });
  }

  canExecute(): boolean {
    if (this.circuitState === 'closed') return true;
    if (this.circuitState === 'open' && Date.now() - this.circuitBreakerLastFailure > this.config.resetTimeout) {
      this.circuitState = 'half-open';
      return true;
    }
    return false;
  }

  recordSuccess(responseTime: number): void {
    this.state.successes++;
    this.state.totalRequests++;
    this.state.lastSuccess = new Date();
    this.circuitBreakerFailures = 0;
    this.circuitState = 'closed';
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 1000) this.responseTimes.shift();
    this.updateMetrics();
  }

  recordFailure(): void {
    this.state.failures++;
    this.state.totalRequests++;
    this.state.lastFailure = new Date();
    this.circuitBreakerFailures++;
    this.circuitBreakerLastFailure = Date.now();
    if (this.circuitBreakerFailures >= this.config.threshold) {
      this.circuitState = 'open';
      this.state.status = 'degraded';
    }
    this.updateMetrics();
  }

  private updateMetrics(): void {
    if (this.responseTimes.length === 0) return;
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    this.state.avgResponseTime = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    this.state.p95ResponseTime = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    this.state.p99ResponseTime = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    this.state.errorRate = this.state.totalRequests > 0 ? this.state.failures / this.state.totalRequests : 0;
    this.state.throughput = this.state.totalRequests / (Date.now() / 1000);
  }

  getCached(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.cache.delete(key); return undefined; }
    entry.hits++;
    return entry.value;
  }

  setCache(key: string, value: unknown): void {
    if (this.cache.size >= this.config.cacheSize) {
      let minHits = Infinity;
      let minKey = '';
      for (const [k, v] of this.cache) { if (v.hits < minHits) { minHits = v.hits; minKey = k; } }
      if (minKey) this.cache.delete(minKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.config.cacheTTL, hits: 0 });
  }

  getState(): ConfigResolverState60 { return { ...this.state, circuitState: this.circuitState }; }
  getCacheSize(): number { return this.cache.size; }
  clearCache(): void { this.cache.clear(); }
  setEnabled(enabled: boolean): void { this.config.enabled = enabled; this.state.status = enabled ? 'idle' : 'failed'; }
  getMetrics() { return { ...this.state, cacheSize: this.cache.size, circuitState: this.circuitState }; }
}