import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheService, appCacheService } from '../src/services/cacheService.js';
import { cacheService } from '../src/utils/cache.js';

vi.mock('../src/utils/cache.js');

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(() => {
    service = new CacheService();
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      vi.mocked(cacheService.get).mockResolvedValue('cached-value');

      const result = await service.get('key');
      expect(result).toBe('cached-value');
      expect(cacheService.get).toHaveBeenCalledWith('key');
    });

    it('should return null if not in cache', async () => {
      vi.mocked(cacheService.get).mockResolvedValue(null);

      const result = await service.get('key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value in cache', async () => {
      vi.mocked(cacheService.set).mockResolvedValue(undefined);

      await service.set('key', 'value', 3600);
      expect(cacheService.set).toHaveBeenCalledWith('key', 'value', 3600);
    });
  });

  describe('delete', () => {
    it('should delete value from cache', async () => {
      vi.mocked(cacheService.delete).mockResolvedValue(undefined);

      await service.delete('key');
      expect(cacheService.delete).toHaveBeenCalledWith('key');
    });
  });

  describe('deletePattern', () => {
    it('should delete values by pattern', async () => {
      vi.mocked(cacheService.deletePattern).mockResolvedValue(undefined);

      await service.deletePattern('user:*');
      expect(cacheService.deletePattern).toHaveBeenCalledWith('user:*');
    });
  });

  describe('clear', () => {
    it('should clear cache', async () => {
      vi.mocked(cacheService.clear).mockResolvedValue(undefined);

      await service.clear();
      expect(cacheService.clear).toHaveBeenCalled();
    });
  });

  describe('has', () => {
    it('should check if key exists', async () => {
      vi.mocked(cacheService.has).mockResolvedValue(true);

      const result = await service.has('key');
      expect(result).toBe(true);
    });

    it('should return false if key does not exist', async () => {
      vi.mocked(cacheService.has).mockResolvedValue(false);

      const result = await service.has('key');
      expect(result).toBe(false);
    });
  });

  describe('getOrSet', () => {
    it('should get existing value', async () => {
      vi.mocked(cacheService.getOrSet).mockResolvedValue('cached-value');

      const result = await service.getOrSet('key', async () => 'new-value');
      expect(result).toBe('cached-value');
    });
  });

  describe('invalidateUserCache', () => {
    it('should invalidate user cache', async () => {
      vi.mocked(cacheService.deletePattern).mockResolvedValue(undefined);

      await service.invalidateUserCache('user-1');
      expect(cacheService.deletePattern).toHaveBeenCalledWith('user:user-1:*');
      expect(cacheService.deletePattern).toHaveBeenCalledWith('tasks:user-1:*');
    });
  });

  describe('invalidateAllCache', () => {
    it('should invalidate all cache', async () => {
      vi.mocked(cacheService.clear).mockResolvedValue(undefined);

      await service.invalidateAllCache();
      expect(cacheService.clear).toHaveBeenCalled();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache stats', async () => {
      const mockStats = { size: 10, keys: ['key1', 'key2'] };
      vi.mocked(cacheService.getStats).mockResolvedValue(mockStats);

      const result = await service.getCacheStats();
      expect(result).toEqual(mockStats);
    });
  });
});
