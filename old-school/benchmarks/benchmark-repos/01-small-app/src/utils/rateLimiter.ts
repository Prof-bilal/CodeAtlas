export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    
    setInterval(() => this.cleanup(), this.windowMs);
  }

  isAllowed(key: string): { allowed: boolean; remaining: number; resetAt: Date } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      const resetAt = now + this.windowMs;
      this.store.set(key, { count: 1, resetAt });
      
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetAt: new Date(resetAt),
      };
    }

    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.resetAt),
      };
    }

    entry.count++;
    
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetAt: new Date(entry.resetAt),
    };
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  resetAll(): void {
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  getStats(): {
    totalKeys: number;
    activeKeys: number;
  } {
    const now = Date.now();
    let activeKeys = 0;
    
    for (const entry of this.store.values()) {
      if (now <= entry.resetAt) {
        activeKeys++;
      }
    }

    return {
      totalKeys: this.store.size,
      activeKeys,
    };
  }
}

export const rateLimiter = new RateLimiter();
