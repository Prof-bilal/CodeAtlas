export interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

export class CacheService {
  private store: Map<string, { value: any; expiresAt: number }> = new Map();
  private prefix: string;

  constructor(prefix: string = 'app') {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);
    const item = this.store.get(fullKey);
    
    if (!item) {
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.store.delete(fullKey);
      return null;
    }

    return item.value as T;
  }

  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    const fullKey = this.getKey(key);
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    
    this.store.set(fullKey, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    this.store.delete(fullKey);
  }

  async deletePattern(pattern: string): Promise<void> {
    const fullPattern = this.getKey(pattern);
    const regex = new RegExp(fullPattern.replace(/\*/g, '.*'));
    
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds: number = 3600): Promise<T> {
    const cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    const current = await this.get<number>(key);
    const newValue = (current || 0) + amount;
    await this.set(key, newValue);
    return newValue;
  }

  async decrement(key: string, amount: number = 1): Promise<number> {
    return this.increment(key, -amount);
  }

  async getStats(): Promise<{
    size: number;
    keys: string[];
  }> {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }
}

export const cacheService = new CacheService();
