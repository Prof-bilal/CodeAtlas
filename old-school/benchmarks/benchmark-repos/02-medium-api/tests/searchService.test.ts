import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchServiceImpl } from '../src/services/searchService.js';
import { databaseService } from '../src/database/databaseService.js';

vi.mock('../src/database/databaseService.js');

describe('SearchServiceImpl', () => {
  let service: SearchServiceImpl;

  beforeEach(() => {
    service = new SearchServiceImpl();
    vi.clearAllMocks();
  });

  describe('indexDocument', () => {
    it('should index document successfully', async () => {
      vi.mocked(databaseService.query).mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      await service.indexDocument('doc-1', 'task', 'Test content');
      expect(databaseService.query).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should return search results', async () => {
      const mockResults = [{ id: 'doc-1', content: 'Test content', rank: 0.8 }];
      vi.mocked(databaseService.query).mockResolvedValue({
        rows: mockResults,
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const results = await service.search('test');
      expect(results).toEqual(mockResults);
    });
  });

  describe('deleteDocument', () => {
    it('should delete document successfully', async () => {
      vi.mocked(databaseService.query).mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: 'DELETE',
        oid: 0,
        fields: [],
      });

      await service.deleteDocument('doc-1');
      expect(databaseService.query).toHaveBeenCalled();
    });
  });
});
