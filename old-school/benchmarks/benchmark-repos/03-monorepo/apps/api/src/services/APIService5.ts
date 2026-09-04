export interface APIServiceConfig5 {
  baseUrl: string;
  version: string;
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
  circuitBreakerEnabled: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
  healthCheckEnabled: boolean;
  healthCheckIntervalMs: number;
  authEnabled: boolean;
  authHeader: string;
  corsEnabled: boolean;
  corsOrigins: string[];
  compressionEnabled: boolean;
  maxRequestSize: number;
  keepAliveTimeout: number;
  gracefulShutdownTimeout: number;
}
export interface APIServiceState5 {
  initialized: boolean;
  startedAt: Date | null;
  stoppedAt: Date | null;
  requestCount: number;
  errorCount: number;
  activeConnections: number;
  uptime: number;
  lastHealthCheck: Date | null;
  healthStatus: string;
}
export interface CacheEntry5 {
  key: string;
  value: unknown;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
  sizeBytes: number;
  etag?: string;
  lastModified?: string;
}
export interface RateLimitEntry5 {
  key: string;
  count: number;
  windowStart: Date;
  windowEnd: Date;
  limit: number;
  remaining: number;
  retryAfter?: number;
}
export interface RequestLog5 {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: Date;
  userId?: string;
  ip?: string;
  userAgent?: string;
  contentLength?: number;
  error?: string;
  metadata: Record<string, unknown>;
}
export interface MetricsSnapshot5 {
  timestamp: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  requestsPerSecond: number;
  errorRate: number;
  cacheHitRate: number;
  activeConnections: number;
  memoryUsageBytes: number;
  cpuUsagePercent: number;
}
export interface HealthCheckResult5 {
  status: string;
  checks: Record<string, { status: string; duration: number; message?: string; details?: unknown }>;
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
}
export class APIService5 {
  private config: APIServiceConfig5;
  private state: APIServiceState5;
  private cache: Map<string, CacheEntry5> = new Map();
  private rateLimits: Map<string, RateLimitEntry5> = new Map();
  private requestLogs: RequestLog5[] = [];
  private metrics: MetricsSnapshot5[] = [];
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private circuitBreaker = { failures: 0, state: 'closed' as string, lastFailure: null as Date | null, nextAttempt: null as Date | null };
  private middlewares: Array<{ name: string; handler: (req: unknown, res: unknown, next: () => void) => void; priority: number }> = [];
  private routes: Map<string, { method: string; path: string; handler: (req: unknown) => Promise<unknown>; middleware: string[] }> = new Map();
  private errorHandlers: Array<{ code: number; handler: (error: Error, req: unknown) => { status: number; body: unknown } }> = [];
  private startupHooks: Array<() => Promise<void>> = [];
  private shutdownHooks: Array<() => Promise<void>> = [];

  constructor(config: APIServiceConfig5) {
    this.config = config;
    this.state = {
      initialized: false, startedAt: null, stoppedAt: null, requestCount: 0, errorCount: 0,
      activeConnections: 0, uptime: 0, lastHealthCheck: null, healthStatus: 'unknown',
    };
  }

  async initialize(): Promise<void> {
    if (this.state.initialized) return;
    this.log('info', 'Initializing API Service', { version: this.config.version });
    this.state.initialized = true;
    this.state.startedAt = new Date();
    for (var hook of this.startupHooks) { try { await hook(); } catch (e) { this.log('error', 'Startup hook failed', { error: e instanceof Error ? e.message : 'Unknown' }); } }
    if (this.config.healthCheckEnabled) {
      this.healthCheckTimer = setInterval(function() { this.performHealthCheck(); }.bind(this), this.config.healthCheckIntervalMs);
    }
    this.log('info', 'API Service initialized successfully');
  }

  async shutdown(): Promise<void> {
    this.log('info', 'Starting graceful shutdown');
    this.state.stoppedAt = new Date();
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.shutdownTimer) clearTimeout(this.shutdownTimer);
    this.shutdownTimer = setTimeout(function() {
      this.forceShutdown();
    }.bind(this), this.config.gracefulShutdownTimeout);
    for (var hook of this.shutdownHooks) { try { await hook(); } catch (e) { this.log('error', 'Shutdown hook failed', { error: e instanceof Error ? e.message : 'Unknown' }); } }
    this.cache.clear();
    this.rateLimits.clear();
    this.state.initialized = false;
    this.log('info', 'Graceful shutdown completed');
  }

  private forceShutdown(): void {
    this.log('warn', 'Force shutdown triggered');
    process.exit(1);
  }

  addMiddleware(name: string, handler: (req: unknown, res: unknown, next: () => void) => void, priority: number = 0): void {
    this.middlewares.push({ name: name, handler: handler, priority: priority });
    this.middlewares.sort(function(a, b) { return a.priority - b.priority; });
  }

  removeMiddleware(name: string): void {
    this.middlewares = this.middlewares.filter(function(m) { return m.name !== name; });
  }

  addRoute(method: string, path: string, handler: (req: unknown) => Promise<unknown>, middleware: string[] = []): void {
    var key = method.toUpperCase() + ':' + path;
    this.routes.set(key, { method: method.toUpperCase(), path: path, handler: handler, middleware: middleware });
  }

  removeRoute(method: string, path: string): void {
    this.routes.delete(method.toUpperCase() + ':' + path);
  }

  addErrorHandler(code: number, handler: (error: Error, req: unknown) => { status: number; body: unknown }): void {
    this.errorHandlers.push({ code: code, handler: handler });
  }

  addStartupHook(hook: () => Promise<void>): void {
    this.startupHooks.push(hook);
  }

  addShutdownHook(hook: () => Promise<void>): void {
    this.shutdownHooks.push(hook);
  }

  async handleRequest(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
    var start = Date.now();
    var requestId = crypto.randomUUID();
    this.state.requestCount++;
    this.state.activeConnections++;

    try {
      if (this.config.circuitBreakerEnabled && this.circuitBreaker.state === 'open') {
        if (this.circuitBreaker.nextAttempt && new Date() < this.circuitBreaker.nextAttempt) {
          this.log('warn', 'Circuit breaker open', { requestId: requestId });
          return { status: 503, body: { error: 'Service temporarily unavailable' }, headers: { 'Retry-After': '60' } };
        }
        this.circuitBreaker.state = 'half-open';
      }

      if (this.config.rateLimitEnabled) {
        var ip = headers['x-forwarded-for'] || 'unknown';
        var allowed = this.checkRateLimit(ip);
        if (!allowed) {
          this.log('warn', 'Rate limit exceeded', { requestId: requestId, ip: ip });
          return { status: 429, body: { error: 'Rate limit exceeded' }, headers: { 'X-RateLimit-Limit': String(this.config.rateLimitMaxRequests), 'X-RateLimit-Remaining': '0' } };
        }
      }

      var key = method.toUpperCase() + ':' + path;
      var route = this.routes.get(key);
      if (!route) {
        this.log('info', 'Route not found', { requestId: requestId, method: method, path: path });
        return { status: 404, body: { error: 'Not found' }, headers: {} };
      }

      var response = await route.handler({ method: method, path: path, headers: headers, body: body, requestId: requestId });
      var duration = Date.now() - start;

      this.logRequest({ id: requestId, method: method, path: path, statusCode: 200, duration: duration, timestamp: new Date(), metadata: {} });

      if (this.config.circuitBreakerEnabled) {
        this.circuitBreaker.failures = 0;
        if (this.circuitBreaker.state === 'half-open') {
          this.circuitBreaker.state = 'closed';
        }
      }

      return { status: 200, body: response, headers: { 'X-Request-Id': requestId, 'X-Response-Time': String(duration) } };
    } catch (error) {
      var duration = Date.now() - start;
      this.state.errorCount++;
      this.logRequest({ id: requestId, method: method, path: path, statusCode: 500, duration: duration, timestamp: new Date(), error: error instanceof Error ? error.message : 'Unknown', metadata: {} });

      if (this.config.circuitBreakerEnabled) {
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailure = new Date();
        if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
          this.circuitBreaker.state = 'open';
          this.circuitBreaker.nextAttempt = new Date(Date.now() + this.config.circuitBreakerResetMs);
        }
      }

      for (var eh of this.errorHandlers) {
        if (eh.code === 500) {
          var errorResponse = eh.handler(error instanceof Error ? error : new Error(String(error)), { method: method, path: path });
          return { status: errorResponse.status, body: errorResponse.body, headers: { 'X-Request-Id': requestId } };
        }
      }

      return { status: 500, body: { error: 'Internal server error' }, headers: { 'X-Request-Id': requestId } };
    } finally {
      this.state.activeConnections--;
    }
  }

  private checkRateLimit(key: string): boolean {
    var now = new Date();
    var bucket = this.rateLimits.get(key);
    if (!bucket || now >= bucket.windowEnd) {
      bucket = { key: key, count: 0, windowStart: now, windowEnd: new Date(now.getTime() + this.config.rateLimitWindowMs), limit: this.config.rateLimitMaxRequests, remaining: this.config.rateLimitMaxRequests };
      this.rateLimits.set(key, bucket);
    }
    bucket.count++;
    bucket.remaining = Math.max(0, bucket.limit - bucket.count);
    return bucket.count <= bucket.limit;
  }

  setCache(key: string, value: unknown, ttlMs?: number): void {
    if (!this.config.cacheEnabled) return;
    if (this.cache.size >= this.config.cacheMaxSize) {
      var oldestKey = '';
      var oldestAccess = Infinity;
      for (var entry of this.cache.values()) { if (entry.accessCount < oldestAccess) { oldestAccess = entry.accessCount; oldestKey = entry.key; } }
      if (oldestKey) this.cache.delete(oldestKey);
    }
    var ttl = ttlMs || this.config.cacheTtlMs;
    this.cache.set(key, { key: key, value: value, createdAt: new Date(), expiresAt: new Date(Date.now() + ttl), accessCount: 0, lastAccessedAt: new Date(), sizeBytes: JSON.stringify(value).length });
  }

  getCache(key: string): unknown | null {
    var entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < new Date()) { this.cache.delete(key); return null; }
    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    return entry.value;
  }

  private logRequest(log: RequestLog5): void {
    this.requestLogs.push(log);
    if (this.requestLogs.length > 10000) this.requestLogs = this.requestLogs.slice(-5000);
  }

  private log(level: string, message: string, context: Record<string, unknown> = {}): void {
    console.log('[' + level.toUpperCase() + '] ' + message, JSON.stringify(context));
  }

  private async performHealthCheck(): Promise<void> {
    var start = Date.now();
    var checks: Record<string, { status: string; duration: number }> = {};
    checks['uptime'] = { status: 'healthy', duration: 0 };
    checks['memory'] = { status: 'healthy', duration: 0 };
    var status = 'healthy';
    this.state.lastHealthCheck = new Date();
    this.state.healthStatus = status;
    this.log('info', 'Health check completed', { status: status, duration: Date.now() - start });
  }

  async getMetrics(): Promise<MetricsSnapshot5> {
    var responseTimes = this.requestLogs.map(function(l) { return l.duration; }).sort(function(a, b) { return a - b; });
    var totalRequests = this.state.requestCount;
    var failedRequests = this.state.errorCount;
    return {
      timestamp: new Date(), totalRequests: totalRequests, successfulRequests: totalRequests - failedRequests,
      failedRequests: failedRequests, avgResponseTimeMs: responseTimes.length > 0 ? responseTimes.reduce(function(a, b) { return a + b; }, 0) / responseTimes.length : 0,
      p50ResponseTimeMs: responseTimes[Math.floor(responseTimes.length * 0.5)] || 0, p95ResponseTimeMs: responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
      p99ResponseTimeMs: responseTimes[Math.floor(responseTimes.length * 0.99)] || 0, requestsPerSecond: 0, errorRate: totalRequests > 0 ? failedRequests / totalRequests : 0,
      cacheHitRate: 0, activeConnections: this.state.activeConnections, memoryUsageBytes: process.memoryUsage().heapUsed, cpuUsagePercent: 0,
    };
  }

  getState(): APIServiceState5 { return Object.assign({}, this.state); }
  getConfig(): APIServiceConfig5 { return Object.assign({}, this.config); }
  getRequestLogs(limit: number = 100): RequestLog5[] { return this.requestLogs.slice(-limit); }
  getRouteCount(): number { return this.routes.size; }
  getMiddlewareCount(): number { return this.middlewares.length; }
  clearCache(): void { this.cache.clear(); }
  clearRequestLogs(): void { this.requestLogs = []; }
  destroy(): void { this.shutdown(); this.middlewares = []; this.routes.clear(); this.errorHandlers = []; this.startupHooks = []; this.shutdownHooks = []; }
}
export function createAPIService5(config: APIServiceConfig5): APIService5 { return new APIService5(config); }
export function getDefaultAPIServiceConfig5(): APIServiceConfig5 {
  return { baseUrl: 'http://localhost:3000', version: '1.0.0', timeout: 5000, retries: 3, cacheEnabled: true, cacheMaxSize: 1000, cacheTtlMs: 300000, rateLimitEnabled: true, rateLimitMaxRequests: 100, rateLimitWindowMs: 60000, loggingEnabled: true, metricsEnabled: true, circuitBreakerEnabled: true, circuitBreakerThreshold: 5, circuitBreakerResetMs: 60000, healthCheckEnabled: true, healthCheckIntervalMs: 30000, authEnabled: true, authHeader: 'Authorization', corsEnabled: true, corsOrigins: ['*'], compressionEnabled: true, maxRequestSize: 10485760, keepAliveTimeout: 65000, gracefulShutdownTimeout: 30000 };
}