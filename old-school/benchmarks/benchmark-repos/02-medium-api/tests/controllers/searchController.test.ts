import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchController } from '../../src/controllers/searchControllerV2.js';
import { SearchService } from '../../src/services/searchService.js';

vi.mock('../../src/services/searchService.js');

describe('SearchController', () => {
  let controller: SearchController;
  let mockService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      search: vi.fn(),
      reindexAll: vi.fn(),
      deleteDocument: vi.fn(),
      indexDocument: vi.fn(),
    };
    vi.mocked(SearchService).mockImplementation(() => mockService);
    controller = new SearchController();
    mockReq = { body: {}, params: {}, query: {} } as any;
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn() } as any;
  });

  it('should search', async () => {
    mockReq.query = { q: 'test' };
    mockService.search.mockResolvedValue({ hits: [], total: 0 });
    await controller.search(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalled();
  });

  it('should reindex', async () => {
    mockService.reindexAll.mockResolvedValue(10);
    await controller.reindex(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith({ reindexed: 10 });
  });
});
