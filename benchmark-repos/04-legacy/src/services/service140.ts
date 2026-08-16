// AuthService140 - DEPRECATED

import { Database } from '../database/connection';
import { Redis } from '../integrations/redis';
import { Logger } from '../utils';
import { v4 as uuidv4 } from 'uuid';

interface AuthConfig140 {
  enabled: boolean;
  timeout: number;
  retries: number;
  cacheTTL: number;
  maxConcurrent: number;
  rateLimit: number;
}

const defaultConfig140: AuthConfig140 = {
  enabled: true,
  timeout: 5000,
  retries: 3,
  cacheTTL: 300,
  maxConcurrent: 10,
  rateLimit: 100,
};

interface AuthMetrics140 {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  avgDuration: number;
  lastProcessedAt: Date | null;
}

export class AuthService140 {
  private db: Database;
  private redis: Redis;
  private config: AuthConfig140;
  private cache: Map<string, { data: any; expires: number }> = new Map();
  private metrics: AuthMetrics140 = {
    totalProcessed: 0,
    successCount: 0,
    errorCount: 0,
    avgDuration: 0,
    lastProcessedAt: null,
  };
  private activeRequests: number = 0;
  private rateLimitWindow: Map<number, number> = new Map();

  constructor(db: Database, redis: Redis, config: Partial<AuthConfig140> = {}) {
    this.db = db;
    this.redis = redis;
    this.config = { ...defaultConfig140, ...config };
  }

  async initialize(): Promise<void> {
    Logger.info(${category}Service140: initializing);
    
    // Verify database connection
    try {
      await this.db.query('SELECT 1');
      Logger.info(${category}Service140: database connected);
    } catch (err) {
      Logger.error(${category}Service140: database connection failed, err);
      throw err;
    }

    // Verify Redis connection
    try {
      await this.redis.set('healthcheck', 'ok');
      Logger.info(${category}Service140: redis connected);
    } catch (err) {
      Logger.error(${category}Service140: redis connection failed, err);
      throw err;
    }

    // Load configuration from database
    await this.loadConfiguration();

    Logger.info(${category}Service140: initialized successfully);
  }

  private async loadConfiguration(): Promise<void> {
    try {
      const results = await this.db.query(
        'SELECT * FROM service_configs WHERE service_name = ?',
        [${category}Service140]
      ) as any[];

      if (results.length > 0) {
        const dbConfig = JSON.parse(results[0].config);
        this.config = { ...this.config, ...dbConfig };
        Logger.info(${category}Service140: loaded config from database);
      }
    } catch (err) {
      Logger.warn(${category}Service140: could not load config from database, using defaults);
    }
  }

  async process(input: {
    userId: string;
    action: string;
    data: Record<string, any>;
    idempotencyKey?: string;
    priority?: number;
    metadata?: Record<string, any>;
  }): Promise<{
    success: boolean;
    result?: any;
    error?: string;
    processedAt: Date;
    duration: number;
    attempt: number;
  }> {
    if (!this.config.enabled) {
      return {
        success: false,
        error: 'Service disabled',
        processedAt: new Date(),
        duration: 0,
        attempt: 0,
      };
    }

    // Check rate limit
    if (!this.checkRateLimit()) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        processedAt: new Date(),
        duration: 0,
        attempt: 0,
      };
    }

    // Check concurrency limit
    if (this.activeRequests >= this.config.maxConcurrent) {
      return {
        success: false,
        error: 'Too many concurrent requests',
        processedAt: new Date(),
        duration: 0,
        attempt: 0,
      };
    }

    // Check idempotency
    if (input.idempotencyKey) {
      const cached = await this.checkIdempotency(input.idempotencyKey);
      if (cached) {
        return {
          success: true,
          result: cached,
          processedAt: new Date(),
          duration: 0,
          attempt: 0,
        };
      }
    }

    this.activeRequests++;
    const startTime = Date.now();
    let lastError: Error | null = null;

    try {
      for (let attempt = 0; attempt < this.config.retries; attempt++) {
        try {
          const result = await this.executeWithTimeout(
            () => this.processAction(input),
            this.config.timeout
          );

          const duration = Date.now() - startTime;

          // Update metrics
          this.updateMetrics(true, duration);

          // Store idempotency key
          if (input.idempotencyKey) {
            await this.storeIdempotency(input.idempotencyKey, result);
          }

          // Cache result
          const cacheKey = ${category}:::;
          this.cache.set(cacheKey, { data: result, expires: Date.now() + this.config.cacheTTL * 1000 });

          Logger.info(${category}Service140: processed  in ms (attempt ));

          return {
            success: true,
            result,
            processedAt: new Date(),
            duration,
            attempt: attempt + 1,
          };

        } catch (err: any) {
          lastError = err;
          Logger.warn(${category}Service140: attempt  failed: );
          
          if (attempt < this.config.retries - 1) {
            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      const duration = Date.now() - startTime;
      this.updateMetrics(false, duration);

      Logger.error(${category}Service140: all  attempts failed);

      return {
        success: false,
        error: lastError?.message || 'Unknown error',
        processedAt: new Date(),
        duration,
        attempt: this.config.retries,
      };

    } finally {
      this.activeRequests--;
    }
  }

  private async processAction(input: {
    userId: string;
    action: string;
    data: Record<string, any>;
  }): Promise<any> {
    const id = uuidv4();

    switch (input.action) {
      case 'create':
        return this.handleCreate(id, input);
      case 'update':
        return this.handleUpdate(id, input);
      case 'delete':
        return this.handleDelete(id, input);
      case 'get':
        return this.handleGet(id, input);
      case 'list':
        return this.handleList(id, input);
      case 'search':
        return this.handleSearch(id, input);
      default:
        return this.handleCustom(id, input);
    }
  }

  private async handleCreate(id: string, input: any): Promise<any> {
    const record = {
      id,
      userId: input.userId,
      ...input.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store in database
    await this.db.query(
      INSERT INTO _records (id, user_id, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?),
      [id, input.userId, JSON.stringify(input.data), record.createdAt.toISOString(), record.updatedAt.toISOString()]
    );

    // Publish event
    await this.redis.lpush(events:, JSON.stringify({
      type: 'created',
      id,
      userId: input.userId,
      timestamp: new Date(),
    }));

    return record;
  }

  private async handleUpdate(id: string, input: any): Promise<any> {
    const existing = await this.db.query(
      SELECT * FROM _records WHERE id = ? AND user_id = ?,
      [input.data.id, input.userId]
    ) as any[];

    if (existing.length === 0) {
      throw new Error('Record not found');
    }

    const updated = {
      ...existing[0],
      ...input.data,
      updatedAt: new Date(),
    };

    await this.db.query(
      UPDATE _records SET data = ?, updated_at = ? WHERE id = ?,
      [JSON.stringify(updated), updated.updatedAt.toISOString(), input.data.id]
    );

    return updated;
  }

  private async handleDelete(id: string, input: any): Promise<any> {
    const result = await this.db.query(
      DELETE FROM _records WHERE id = ? AND user_id = ?,
      [input.data.id, input.userId]
    );

    return { deleted: true, id: input.data.id };
  }

  private async handleGet(id: string, input: any): Promise<any> {
    const cacheKey = ${category}:get:;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    const results = await this.db.query(
      SELECT * FROM _records WHERE id = ? AND user_id = ?,
      [input.data.id, input.userId]
    ) as any[];

    if (results.length === 0) {
      throw new Error('Record not found');
    }

    const record = results[0];
    this.cache.set(cacheKey, { data: record, expires: Date.now() + this.config.cacheTTL * 1000 });

    return record;
  }

  private async handleList(id: string, input: any): Promise<any> {
    const page = input.data.page || 1;
    const limit = input.data.limit || 20;
    const offset = (page - 1) * limit;

    const results = await this.db.query(
      SELECT * FROM _records WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?,
      [input.userId, limit, offset]
    ) as any[];

    const countResult = await this.db.query(
      SELECT COUNT(*) as total FROM _records WHERE user_id = ?,
      [input.userId]
    ) as any[];

    return {
      items: results,
      total: countResult[0].total,
      page,
      limit,
      totalPages: Math.ceil(countResult[0].total / limit),
    };
  }

  private async handleSearch(id: string, input: any): Promise<any> {
    const query = input.data.query || '';
    const results = await this.db.query(
      SELECT * FROM _records WHERE user_id = ? AND data LIKE ? LIMIT 50,
      [input.userId, %%]
    ) as any[];

    return { items: results, query };
  }

  private async handleCustom(id: string, input: any): Promise<any> {
    return {
      id,
      action: input.action,
      data: input.data,
      processedAt: new Date(),
    };
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeout)
      ),
    ]);
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    // Clean old entries
    for (const [timestamp] of this.rateLimitWindow) {
      if (timestamp < windowStart) {
        this.rateLimitWindow.delete(timestamp);
      }
    }

    // Check current rate
    if (this.rateLimitWindow.size >= this.config.rateLimit) {
      return false;
    }

    this.rateLimitWindow.set(now, 1);
    return true;
  }

  private async checkIdempotency(key: string): Promise<any | null> {
    const cached = await this.redis.get(idempotent:);
    return cached ? JSON.parse(cached) : null;
  }

  private async storeIdempotency(key: string, result: any): Promise<void> {
    await this.redis.setex(idempotent:, 86400, JSON.stringify(result));
  }

  private updateMetrics(success: boolean, duration: number): void {
    this.metrics.totalProcessed++;
    if (success) {
      this.metrics.successCount++;
    } else {
      this.metrics.errorCount++;
    }
    this.metrics.avgDuration = (this.metrics.avgDuration * (this.metrics.totalProcessed - 1) + duration) / this.metrics.totalProcessed;
    this.metrics.lastProcessedAt = new Date();
  }

  async getMetrics(): Promise<AuthMetrics140> {
    return { ...this.metrics };
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  getStatus(): { enabled: boolean; cacheSize: number; activeRequests: number; metrics: AuthMetrics140 } {
    return {
      enabled: this.config.enabled,
      cacheSize: this.cache.size,
      activeRequests: this.activeRequests,
      metrics: this.metrics,
    };
  }

  async healthCheck(): Promise<{ status: string; latency: number; details: any }> {
    const start = Date.now();
    try {
      await this.db.query('SELECT 1');
      const redisOk = await this.redis.get('healthcheck');
      
      return {
        status: 'healthy',
        latency: Date.now() - start,
        details: {
          database: 'connected',
          redis: redisOk ? 'connected' : 'disconnected',
          cacheSize: this.cache.size,
          activeRequests: this.activeRequests,
        },
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        latency: Date.now() - start,
        details: { error: (err as Error).message },
      };
    }
  }

  async shutdown(): Promise<void> {
    Logger.info(${category}Service140: shutting down);
    this.cache.clear();
    this.rateLimitWindow.clear();
  }
}
