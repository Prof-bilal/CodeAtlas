export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (identifier: string) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitInfo {
  totalHits: number;
  remaining: number;
  resetTime: Date;
  isLimited: boolean;
}

interface RateLimitEntry {
  count: number;
  resetTime: Date;
}

export class RateLimitGuard {
  private config: RateLimitConfig;
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.config = {
      keyGenerator: (id: string) => id,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...config,
    };
    this.cleanupInterval = setInterval(() => this.cleanup(), this.config.windowMs);
  }

  check(identifier: string): RateLimitInfo {
    const key = this.config.keyGenerator!(identifier);
    const now = new Date();
    let entry = this.store.get(key);
    if (!entry || now >= entry.resetTime) {
      entry = {
        count: 0,
        resetTime: new Date(now.getTime() + this.config.windowMs),
      };
      this.store.set(key, entry);
    }
    entry.count++;
    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    return {
      totalHits: entry.count,
      remaining,
      resetTime: entry.resetTime,
      isLimited: entry.count > this.config.maxRequests,
    };
  }

  consume(identifier: string): boolean {
    const info = this.check(identifier);
    return !info.isLimited;
  }

  reset(identifier: string): void {
    const key = this.config.keyGenerator!(identifier);
    this.store.delete(key);
  }

  resetAll(): void {
    this.store.clear();
  }

  getInfo(identifier: string): RateLimitInfo {
    const key = this.config.keyGenerator!(identifier);
    const entry = this.store.get(key);
    if (!entry) {
      return {
        totalHits: 0,
        remaining: this.config.maxRequests,
        resetTime: new Date(Date.now() + this.config.windowMs),
        isLimited: false,
      };
    }
    return {
      totalHits: entry.count,
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetTime: entry.resetTime,
      isLimited: entry.count > this.config.maxRequests,
    };
  }

  private cleanup(): void {
    const now = new Date();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  getStoreSize(): number {
    return this.store.size;
  }

  static create(config: RateLimitConfig): RateLimitGuard {
    return new RateLimitGuard(config);
  }

  static perMinute(maxRequests: number = 60): RateLimitGuard {
    return new RateLimitGuard({ windowMs: 60 * 1000, maxRequests });
  }

  static perHour(maxRequests: number = 1000): RateLimitGuard {
    return new RateLimitGuard({ windowMs: 60 * 60 * 1000, maxRequests });
  }

  static perDay(maxRequests: number = 10000): RateLimitGuard {
    return new RateLimitGuard({ windowMs: 24 * 60 * 60 * 1000, maxRequests });
  }
}
