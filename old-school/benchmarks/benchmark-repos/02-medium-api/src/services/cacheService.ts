import { cacheService } from '../utils/cache.js';
import { logger } from '../utils/logger.js';

export interface CacheStrategy {
  key: string;
  ttl: number;
  getter: () => Promise<any>;
}

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    return cacheService.get<T>(key);
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await cacheService.set(key, value, ttl);
  }

  async delete(key: string): Promise<void> {
    await cacheService.delete(key);
  }

  async deletePattern(pattern: string): Promise<void> {
    await cacheService.deletePattern(pattern);
  }

  async clear(): Promise<void> {
    await cacheService.clear();
  }

  async has(key: string): Promise<boolean> {
    return cacheService.has(key);
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl: number = 3600): Promise<T> {
    return cacheService.getOrSet(key, factory, ttl);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.deletePattern(`user:${userId}:*`);
    await this.deletePattern(`tasks:${userId}:*`);
  }

  async invalidateAllCache(): Promise<void> {
    await this.clear();
  }

  async getCacheStats(): Promise<{
    size: number;
    keys: string[];
  }> {
    return cacheService.getStats();
  }
}

export const appCacheService = new CacheService();
