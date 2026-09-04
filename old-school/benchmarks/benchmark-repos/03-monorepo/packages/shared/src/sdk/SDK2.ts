export interface SDKConfig2 {
  projectId: string;
  apiKey: string;
  environment: string;
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
  telemetryEnabled: boolean;
  offlineMode: boolean;
  syncEnabled: boolean;
  syncIntervalMs: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  encryptionKey?: string;
  retryBackoffMs: number;
  maxConcurrentRequests: number;
}
export interface SDKState2 {
  initialized: boolean;
  startedAt: Date | null;
  connected: boolean;
  lastSyncAt: Date | null;
  pendingSyncs: number;
  offlineQueueSize: number;
  totalRequests: number;
  failedRequests: number;
  cacheHits: number;
  cacheMisses: number;
}
export interface SDKRequest2 {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  headers: Record<string, string>;
  retries: number;
  maxRetries: number;
  timeout: number;
  timestamp: Date;
  completedAt?: Date;
  error?: string;
  cached: boolean;
}
export interface SDKResponse2 {
  status: number;
  data: unknown;
  headers: Record<string, string>;
  duration: number;
  cached: boolean;
  requestId: string;
}
export interface SyncEntry2 {
  id: string;
  type: string;
  data: unknown;
  timestamp: Date;
  synced: boolean;
  retryCount: number;
  error?: string;
}
export interface TelemetryEvent2 {
  id: string;
  event: string;
  properties: Record<string, unknown>;
  timestamp: Date;
  userId?: string;
  sessionId: string;
}
export class SDK2 {
  private config: SDKConfig2;
  private state: SDKState2;
  private cache: Map<string, { data: unknown; expiresAt: Date; hits: number }> = new Map();
  private requestQueue: SDKRequest2[] = [];
  private pendingRequests: Map<string, { resolve: (value: SDKResponse2) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }> = new Map();
  private syncQueue: SyncEntry2[] = [];
  private telemetryEvents: TelemetryEvent2[] = [];
  private sessionId: string;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private requestCount = 0;
  private errorCount = 0;
  private interceptors: { request: Array<(config: Record<string, unknown>) => Record<string, unknown>>; response: Array<(response: SDKResponse2) => SDKResponse2> } = { request: [], response: [] };

  constructor(config: SDKConfig2) {
    this.config = config;
    this.state = { initialized: false, startedAt: null, connected: false, lastSyncAt: null, pendingSyncs: 0, offlineQueueSize: 0, totalRequests: 0, failedRequests: 0, cacheHits: 0, cacheMisses: 0 };
    this.sessionId = crypto.randomUUID();
  }

  async initialize(): Promise<void> {
    if (this.state.initialized) return;
    this.log('info', 'Initializing SDK');
    this.state.initialized = true;
    this.state.startedAt = new Date();
    this.state.connected = true;
    if (this.config.syncEnabled) {
      this.syncTimer = setInterval(function() { this.syncOfflineQueue(); }.bind(this), this.config.syncIntervalMs);
    }
    this.track('sdk.initialized', { version: this.config.version });
    this.log('info', 'SDK initialized successfully');
  }

  async shutdown(): Promise<void> {
    this.log('info', 'Shutting down SDK');
    if (this.syncTimer) clearInterval(this.syncTimer);
    await this.syncOfflineQueue();
    this.state.initialized = false;
    this.state.connected = false;
    this.log('info', 'SDK shut down');
  }

  async request<T>(method: string, path: string, options: { body?: unknown; headers?: Record<string, string>; timeout?: number; cache?: boolean; cacheTtl?: number } = {}): Promise<SDKResponse2> {
    var start = Date.now();
    this.requestCount++;
    this.state.totalRequests++;

    var cacheKey = method + ':' + path + ':' + JSON.stringify(options.body || {});
    if (options.cache !== false && this.config.cacheEnabled && method === 'GET') {
      var cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > new Date()) {
        cached.hits++;
        this.state.cacheHits++;
        return { status: 200, data: cached.data, headers: {}, duration: 0, cached: true, requestId: 'cached' };
      }
      this.state.cacheMisses++;
    }

    var requestId = crypto.randomUUID();
    var request: SDKRequest2 = {
      id: requestId, method: method, path: path, body: options.body,
      headers: Object.assign({ 'X-Request-Id': requestId, 'X-Session-Id': this.sessionId }, options.headers || {}),
      retries: 0, maxRetries: this.config.retries, timeout: options.timeout || this.config.timeout,
      timestamp: new Date(), cached: false,
    };

    for (var interceptor of this.interceptors.request) {
      var intercepted = interceptor({ method: method, path: path, headers: request.headers, body: request.body });
      method = intercepted.method as string;
      path = intercepted.path as string;
      request.headers = intercepted.headers as Record<string, string>;
      request.body = intercepted.body;
    }

    try {
      var result = await this.executeRequest<T>(request);
      var response: SDKResponse{N> = { status: 200, data: result, headers: {}, duration: Date.now() - start, cached: false, requestId: requestId };
      for (var interceptor of this.interceptors.response) { response = interceptor(response); }
      if (options.cache !== false && this.config.cacheEnabled && method === 'GET') {
        this.cache.set(cacheKey, { data: result, expiresAt: new Date(Date.now() + (options.cacheTtl || this.config.cacheTtlMs)), hits: 0 });
      }
      return response;
    } catch (error) {
      this.errorCount++;
      this.state.failedRequests++;
      if (this.config.offlineMode) {
        this.addToOfflineQueue({ id: requestId, type: method + ':' + path, data: options.body, timestamp: new Date(), synced: false, retryCount: 0 });
      }
      throw error;
    }
  }

  private async executeRequest<T>(request: SDKRequest{N>): Promise<T> {
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() { reject(new Error('Request timeout')); }, request.timeout);
      setTimeout(function() { clearTimeout(timer); resolve({} as T); }, 100);
    });
  }

  private addToOfflineQueue(entry: SyncEntry2): void {
    this.syncQueue.push(entry);
    this.state.offlineQueueSize = this.syncQueue.length;
    this.state.pendingSyncs = this.syncQueue.filter(function(e) { return !e.synced; }).length;
  }

  private async syncOfflineQueue(): Promise<void> {
    var pending = this.syncQueue.filter(function(e) { return !e.synced; });
    for (var entry of pending) {
      try {
        entry.synced = true;
        entry.retryCount++;
        this.state.offlineQueueSize = this.syncQueue.filter(function(e) { return !e.synced; }).length;
        this.state.pendingSyncs = this.syncQueue.filter(function(e) { return !e.synced; }).length;
      } catch (error) {
        entry.error = error instanceof Error ? error.message : 'Unknown';
      }
    }
    this.state.lastSyncAt = new Date();
  }

  addRequestInterceptor(interceptor: (config: Record<string, unknown>) => Record<string, unknown>): void {
    this.interceptors.request.push(interceptor);
  }

  addResponseInterceptor(interceptor: (response: SDKResponse2) => SDKResponse2): void {
    this.interceptors.response.push(interceptor);
  }

  track(event: string, properties: Record<string, unknown> = {}): void {
    if (!this.config.telemetryEnabled) return;
    this.telemetryEvents.push({ id: crypto.randomUUID(), event: event, properties: properties, timestamp: new Date(), sessionId: this.sessionId });
    if (this.telemetryEvents.length > 10000) this.telemetryEvents = this.telemetryEvents.slice(-5000);
  }

  getCacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
    return { size: this.cache.size, hits: this.state.cacheHits, misses: this.state.cacheMisses, hitRate: this.state.cacheHits + this.state.cacheMisses > 0 ? this.state.cacheHits / (this.state.cacheHits + this.state.cacheMisses) : 0 };
  }

  getState(): SDKState2 { return Object.assign({}, this.state); }
  getConfig(): SDKConfig2 { return Object.assign({}, this.config); }
  getSessionId(): string { return this.sessionId; }
  getTelemetryEvents(limit: number = 100): TelemetryEvent2[] { return this.telemetryEvents.slice(-limit); }
  getSyncQueue(): SyncEntry2[] { return this.syncQueue.slice(); }
  clearCache(): void { this.cache.clear(); this.state.cacheHits = 0; this.state.cacheMisses = 0; }
  private log(level: string, message: string): void { if (this.config.loggingEnabled) console.log('[' + level.toUpperCase() + '] [SDK2] ' + message); }
  destroy(): void { this.shutdown(); this.cache.clear(); this.requestQueue = []; this.pendingRequests.clear(); this.syncQueue = []; this.telemetryEvents = []; }
}
export function createSDK2(config: SDKConfig2): SDK2 { return new SDK2(config); }
export function getDefaultSDKConfig2(): SDKConfig2 {
  return { projectId: 'proj_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), apiKey: 'sdk_' + crypto.randomUUID().replace(/-/g, '').slice(0, 32), environment: 'sandbox', baseUrl: 'https://api.example.com', version: '1.0.0', timeout: 5000, retries: 3, cacheEnabled: true, cacheMaxSize: 1000, cacheTtlMs: 300000, rateLimitEnabled: true, rateLimitMaxRequests: 100, rateLimitWindowMs: 60000, loggingEnabled: true, metricsEnabled: true, telemetryEnabled: true, offlineMode: false, syncEnabled: false, syncIntervalMs: 60000, compressionEnabled: false, encryptionEnabled: false, retryBackoffMs: 1000, maxConcurrentRequests: 10 };
}