export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

export class TTLCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private defaultTTL: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(defaultTTL: number = 60000) {
    this.defaultTTL = defaultTTL;
    
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, defaultTTL);
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    
    return entry.value;
  }

  set(key: K, value: V, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL);
    
    this.cache.set(key, {
      value,
      expiresAt,
      accessCount: 0,
      lastAccessedAt: Date.now(),
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  getStats(): {
    size: number;
    totalAccessCount: number;
    averageAccessCount: number;
  } {
    let totalAccessCount = 0;
    
    for (const entry of this.cache.values()) {
      totalAccessCount += entry.accessCount;
    }
    
    return {
      size: this.cache.size,
      totalAccessCount,
      averageAccessCount: this.cache.size > 0 ? totalAccessCount / this.cache.size : 0,
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
