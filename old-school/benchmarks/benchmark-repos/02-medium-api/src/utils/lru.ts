export interface LRUCacheOptions {
  maxSize: number;
  ttl?: number;
}

export class LRUCache<K, V> {
  private cache: Map<K, { value: V; expiresAt?: number }> = new Map();
  private maxSize: number;
  private ttl?: number;

  constructor(options: LRUCacheOptions) {
    this.maxSize = options.maxSize;
    this.ttl = options.ttl;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }
    
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    const entry: { value: V; expiresAt?: number } = { value };
    
    if (this.ttl) {
      entry.expiresAt = Date.now() + this.ttl;
    }
    
    this.cache.set(key, entry);
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }
    
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
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

  size(): number {
    return this.cache.size;
  }

  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  values(): V[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  getStats(): {
    size: number;
    maxSize: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}
