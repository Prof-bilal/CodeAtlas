import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from '../../src/services/searchService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('SearchService', () => {
  let searchService: SearchService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    searchService = new SearchService(mockEventBus);
  });

  describe('indexDocument', () => {
    it('should index a document', async () => {
      await searchService.indexDocument('doc-1', 'task', 'Test content', { title: 'Test' });
      expect(mockEventBus.emit).toHaveBeenCalledWith('search:indexed', { documentId: 'doc-1', type: 'task' });
    });
  });

  describe('search', () => {
    it('should return search results', async () => {
      await searchService.indexDocument('doc-1', 'task', 'Hello world', {});
      const results = await searchService.search('Hello');
      expect(results).toBeDefined();
    });
  });

  describe('deleteDocument', () => {
    it('should delete document', async () => {
      await searchService.deleteDocument('doc-1');
      expect(mockEventBus.emit).toHaveBeenCalledWith('search:deleted', { documentId: 'doc-1' });
    });
  });
});
