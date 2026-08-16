export interface CacheEntry<T> {
  key: string;
  value: T;
  expiresAt: Date;
  createdAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
}

export interface CacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  onEvict?: (key: string, value: unknown) => void;
}

export class Cache<T> {
  private store: Map<string, CacheEntry<T>> = new Map();
  private options: Required<CacheOptions>;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttlMs: options.ttlMs || 5 * 60 * 1000,
      maxEntries: options.maxEntries || 1000,
      onEvict: options.onEvict || (() => {}),
    };
    this.cleanupInterval = setInterval(() => this.cleanup(), this.options.ttlMs);
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (new Date() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }
    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.store.size >= this.options.maxEntries) {
      this.evictLeastUsed();
    }
    const now = new Date();
    this.store.set(key, {
      key,
      value,
      expiresAt: new Date(now.getTime() + (ttlMs || this.options.ttlMs)),
      createdAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    });
  }

  delete(key: string): boolean {
    const entry = this.store.get(key);
    if (entry) {
      this.options.onEvict(key, entry.value);
      return this.store.delete(key);
    }
    return false;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    for (const [key, entry] of this.store.entries()) {
      this.options.onEvict(key, entry.value);
    }
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }

  values(): T[] {
    return Array.from(this.store.entries())
      .filter(([_, entry]) => new Date() <= entry.expiresAt)
      .map(([_, entry]) => entry.value);
  }

  entries(): Array<{ key: string; value: T; ttl: number }> {
    const now = new Date();
    return Array.from(this.store.entries())
      .filter(([_, entry]) => now <= entry.expiresAt)
      .map(([_, entry]) => ({
        key: entry.key,
        value: entry.value,
        ttl: entry.expiresAt.getTime() - now.getTime(),
      }));
  }

  getOrSet(key: string, factory: () => T, ttlMs?: number): T {
    const value = this.get(key);
    if (value !== undefined) return value;
    const newValue = factory();
    this.set(key, newValue, ttlMs);
    return newValue;
  }

  async getOrSetAsync(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
    const value = this.get(key);
    if (value !== undefined) return value;
    const newValue = await factory();
    this.set(key, newValue, ttlMs);
    return newValue;
  }

  private evictLeastUsed(): void {
    let leastKey: string | null = null;
    let leastAccess = Infinity;
    for (const [key, entry] of this.store.entries()) {
      if (entry.accessCount < leastAccess) {
        leastAccess = entry.accessCount;
        leastKey = key;
      }
    }
    if (leastKey) this.delete(leastKey);
  }

  private cleanup(): void {
    const now = new Date();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  getStats() {
    return {
      size: this.store.size,
      maxEntries: this.options.maxEntries,
      ttlMs: this.options.ttlMs,
    };
  }
}

export function createCache<T>(options?: CacheOptions): Cache<T> {
  return new Cache<T>(options);
}
