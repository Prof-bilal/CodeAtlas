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

  describe('clear', () => {
    it('should clear cache', async () => {
      vi.mocked(cacheService.clear).mockResolvedValue(undefined);

      await service.clear();
      expect(cacheService.clear).toHaveBeenCalled();
    });
  });
});
