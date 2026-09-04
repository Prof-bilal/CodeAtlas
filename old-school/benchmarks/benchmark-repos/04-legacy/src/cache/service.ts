// Cache service - CURRENT

import { Redis } from '../integrations/redis';
import { Logger } from '../utils';

export interface CacheOptions {
  ttl: number;
  prefix?: string;
}

export class CacheService {
  private redis: Redis;
  private defaultTTL: number;

  constructor(redis: Redis, defaultTTL: number = 300) {
    this.redis = redis;
    this.defaultTTL = defaultTTL;
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const expiry = ttl || this.defaultTTL;
    await this.redis.setex(key, expiry, serialized);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    for (const key of keys) {
      await this.redis.del(key);
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    const current = await this.get<number>(key);
    const newValue = (current || 0) + amount;
    await this.set(key, newValue);
    return newValue;
  }

  async decrement(key: string, amount: number = 1): Promise<number> {
    const current = await this.get<number>(key);
    const newValue = (current || 0) - amount;
    await this.set(key, newValue);
    return newValue;
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.redis.get(key);
    return value !== null;
  }

  async keys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }

  // Tag-based cache invalidation
  async invalidateTag(tag: string): Promise<void> {
    await this.delPattern(	ag::*);
  }

  async addTag(key: string, tag: string): Promise<void> {
    await this.redis.setex(	ag::, this.defaultTTL, '1');
  }
}
