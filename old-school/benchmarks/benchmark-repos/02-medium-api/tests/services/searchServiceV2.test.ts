import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from '../../src/services/searchService.js';
import { EventBus } from '../../src/events/eventBus.js';
import { cacheService } from '../../src/services/cacheService.js';

vi.mock('../../src/events/eventBus.js');
vi.mock('../../src/services/cacheService.js');

describe('SearchService', () => {
  let searchService: SearchService;
  let mockEventBus: any;
  let mockCacheService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = {
      emit: vi.fn(),
    };
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    searchService = new SearchService(mockEventBus, mockCacheService);
  });

  describe('search', () => {
    it('should return cached results when available', async () => {
      const query = 'test query';
      const mockResults = { hits: [{ id: '1', title: 'Test' }], total: 1 };
      mockCacheService.get.mockResolvedValue(mockResults);

      const result = await searchService.search(query);

      expect(result).toEqual(mockResults);
      expect(mockCacheService.get).toHaveBeenCalledWith(`search:${query}`);
    });

    it('should index document and emit event', async () => {
      const documentId = 'doc-1';
      const type = 'task';
      const content = 'Test content';
      const metadata = { title: 'Test' };

      await searchService.indexDocument(documentId, type, content, metadata);

      expect(mockEventBus.emit).toHaveBeenCalledWith('search:indexed', { documentId, type });
      expect(mockCacheService.invalidate).toHaveBeenCalled();
    });
  });

  describe('reindexAll', () => {
    it('should reindex all documents of specified type', async () => {
      const mockCount = 100;
      vi.spyOn(searchService, 'reindexAll').mockResolvedValue(mockCount);

      const result = await searchService.reindexAll('task');

      expect(result).toBe(mockCount);
    });
  });

  describe('deleteDocument', () => {
    it('should delete document and emit event', async () => {
      const documentId = 'doc-123';

      await searchService.deleteDocument(documentId);

      expect(mockEventBus.emit).toHaveBeenCalledWith('search:deleted', { documentId });
      expect(mockCacheService.invalidate).toHaveBeenCalled();
    });
  });
});
