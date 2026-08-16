import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyController } from '../../src/controllers/apiKeyControllerV2.js';
import { ApiKeyService } from '../../src/services/apiKeyService.js';

vi.mock('../../src/services/apiKeyService.js');

describe('ApiKeyController', () => {
  let controller: ApiKeyController;
  let mockService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      getUserApiKeys: vi.fn(),
      getApiKey: vi.fn(),
      createApiKey: vi.fn(),
      revokeApiKey: vi.fn(),
      validateApiKey: vi.fn(),
    };
    vi.mocked(ApiKeyService).mockImplementation(() => mockService);
    controller = new ApiKeyController();
    mockReq = { body: {}, params: {}, user: { id: 'user-1' } } as any;
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn() } as any;
  });

  it('should get api keys', async () => {
    mockService.getUserApiKeys.mockResolvedValue([]);
    await controller.getApiKeys(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith([]);
  });

  it('should revoke api key', async () => {
    mockReq.params = { id: 'key-1' };
    mockService.revokeApiKey.mockResolvedValue(undefined);
    await controller.revokeApiKey(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(204);
  });
});
