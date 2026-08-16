export interface ServiceConfig31 {
  name: string;
  timeout: number;
  retries: number;
  cacheEnabled: boolean;
  cacheMaxSize: number;
  cacheTtlMs: number;
  rateLimitEnabled: boolean;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  loggingEnabled: boolean;
  metricsEnabled: boolean;
}

export interface ServiceResult31<T> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  metadata: Record<string, unknown>;
}

export interface CacheEntry31<T> {
  value: T;
  expiresAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
}

export interface RateLimitEntry31 {
  count: number;
  resetTime: Date;
}

export interface MetricEntry31 {
  name: string;
  value: number;
  timestamp: Date;
  tags: Record<string, string>;
}

export class Service31 {
  private config: ServiceConfig31;
  private cache: Map<string, CacheEntry31<unknown>> = new Map();
  private rateLimitStore: Map<string, RateLimitEntry31> = new Map();
  private metrics: MetricEntry31[] = [];
  private logs: Array<{ level: string; message: string; timestamp: Date }> = [];
  private requestCount = 0;
  private errorCount = 0;
  private startTime = new Date();

  constructor(config: ServiceConfig31) {
    this.config = config;
    if (this.config.cacheEnabled) {
      setInterval(() => this.cleanupCache(), 60000);
    }
  }

  async execute<T>(key: string, fn: () => Promise<T>): Promise<ServiceResult31<T>> {
    const start = Date.now();
    this.requestCount++;

    if (this.config.loggingEnabled) {
      this.log('info', Executing: );
    }

    if (this.config.rateLimitEnabled) {
      const rateLimitKey = 'default';
      const allowed = this.checkRateLimit(rateLimitKey);
      if (!allowed) {
        this.errorCount++;
        return {
          success: false,
          error: 'Rate limit exceeded',
          duration: Date.now() - start,
          metadata: { rateLimited: true },
        };
      }
    }

    if (this.config.cacheEnabled) {
      const cached = this.getFromCache<T>(key);
      if (cached !== null) {
        this.recordMetric('cache.hit', 1, { key });
        return {
          success: true,
          data: cached,
          duration: Date.now() - start,
          metadata: { cached: true },
        };
      }
      this.recordMetric('cache.miss', 1, { key });
    }

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        const data = await fn();
        if (this.config.cacheEnabled) {
          this.setInCache(key, data);
        }
        if (this.config.metricsEnabled) {
          this.recordMetric('success', 1, { key, attempt: String(attempt) });
        }
        return {
          success: true,
          data,
          duration: Date.now() - start,
          metadata: { attempt, cached: false },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.errorCount++;
        if (this.config.loggingEnabled) {
          this.log('error', Error in attempt : );
        }
        if (this.config.metricsEnabled) {
          this.recordMetric('error', 1, { key, attempt: String(attempt), error: lastError.message });
        }
        if (attempt < this.config.retries) {
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      duration: Date.now() - start,
      metadata: { attempts: this.config.retries },
    };
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < new Date()) {
      this.cache.delete(key);
      return null;
    }
    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    return entry.value as T;
  }

  private setInCache<T>(key: string, value: T): void {
    if (this.cache.size >= this.config.cacheMaxSize) {
      this.evictLeastUsed();
    }
    this.cache.set(key, {
      value,
      expiresAt: new Date(Date.now() + this.config.cacheTtlMs),
      accessCount: 0,
      lastAccessedAt: new Date(),
    });
  }

  private evictLeastUsed(): void {
    let leastKey: string | null = null;
    let leastAccess = Infinity;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < leastAccess) {
        leastAccess = entry.accessCount;
        leastKey = key;
      }
    }
    if (leastKey) this.cache.delete(leastKey);
  }

  private cleanupCache(): void {
    const now = new Date();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }

  private checkRateLimit(key: string): boolean {
    const now = new Date();
    let entry = this.rateLimitStore.get(key);
    if (!entry || now >= entry.resetTime) {
      entry = { count: 0, resetTime: new Date(now.getTime() + this.config.rateLimitWindowMs) };
      this.rateLimitStore.set(key, entry);
    }
    entry.count++;
    return entry.count <= this.config.rateLimitMaxRequests;
  }

  private recordMetric(name: string, value: number, tags: Record<string, string>): void {
    this.metrics.push({ name, value, timestamp: new Date(), tags });
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-500);
    }
  }

  private log(level: string, message: string): void {
    this.logs.push({ level, message, timestamp: new Date() });
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-500);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  clearLogs(): void {
    this.logs = [];
  }

  getStats(): {
    requests: number;
    errors: number;
    cacheSize: number;
    hitRate: number;
    uptime: number;
    metricCount: number;
    logCount: number;
  } {
    return {
      requests: this.requestCount,
      errors: this.errorCount,
      cacheSize: this.cache.size,
      hitRate: this.requestCount > 0 ? (this.requestCount - this.errorCount) / this.requestCount : 0,
      uptime: Date.now() - this.startTime.getTime(),
      metricCount: this.metrics.length,
      logCount: this.logs.length,
    };
  }

  getConfig(): ServiceConfig31 {
    return { ...this.config };
  }

  getMetrics(): MetricEntry31[] {
    return [...this.metrics];
  }

  getLogs(): Array<{ level: string; message: string; timestamp: Date }> {
    return [...this.logs];
  }

  destroy(): void {
    this.cache.clear();
    this.rateLimitStore.clear();
    this.metrics = [];
    this.logs = [];
    this.requestCount = 0;
    this.errorCount = 0;
  }
}

export function createService31(config: ServiceConfig31): Service31 {
  return new Service31(config);
}

export function getDefaultServiceConfig31(): ServiceConfig31 {
  return {
    name: 'Service31',
    timeout: 5000,
    retries: 3,
    cacheEnabled: true,
    cacheMaxSize: 1000,
    cacheTtlMs: 300000,
    rateLimitEnabled: true,
    rateLimitMaxRequests: 100,
    rateLimitWindowMs: 60000,
    loggingEnabled: true,
    metricsEnabled: true,
  };
}
