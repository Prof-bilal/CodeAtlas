export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (identifier: string) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  total: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: Date;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.config = {
      message: 'Too many requests',
      skipSuccessfulRequests: false,
      ...config,
    };
    this.cleanupInterval = setInterval(() => this.cleanup(), this.config.windowMs);
  }

  check(identifier: string): RateLimitResult {
    const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier;
    const now = new Date();
    let entry = this.store.get(key);
    if (!entry || now >= entry.resetTime) {
      entry = { count: 0, resetTime: new Date(now.getTime() + this.config.windowMs) };
      this.store.set(key, entry);
    }
    entry.count++;
    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    return {
      allowed: entry.count <= this.config.maxRequests,
      remaining,
      resetTime: entry.resetTime,
      total: this.config.maxRequests,
    };
  }

  reset(identifier: string): void {
    const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier;
    this.store.delete(key);
  }

  resetAll(): void {
    this.store.clear();
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

  getHeaders(result: RateLimitResult): Record<string, string> {
    return {
      'X-RateLimit-Limit': String(result.total),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.resetTime.getTime() / 1000)),
    };
  }

  static create(config: RateLimitConfig): RateLimiter {
    return new RateLimiter(config);
  }

  static perMinute(maxRequests: number = 60): RateLimiter {
    return new RateLimiter({ windowMs: 60 * 1000, maxRequests });
  }

  static perHour(maxRequests: number = 1000): RateLimiter {
    return new RateLimiter({ windowMs: 60 * 60 * 1000, maxRequests });
  }
}
