import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyServiceImpl } from '../src/services/apiKeyService.js';
import { ApiKeyRepository } from '../src/database/repositories/apiKeyRepository.js';
import { generateRandomString, hashString } from '../src/utils/crypto.js';
import { eventBus } from '../src/events/eventBus.js';

vi.mock('../src/database/repositories/apiKeyRepository.js');
vi.mock('../src/utils/crypto.js');
vi.mock('../src/events/eventBus.js');

describe('ApiKeyServiceImpl', () => {
  let service: ApiKeyServiceImpl;
  let mockApiKeyRepository: any;

  beforeEach(() => {
    service = new ApiKeyServiceImpl();
    mockApiKeyRepository = vi.mocked(ApiKeyRepository.prototype);
    vi.clearAllMocks();
  });

  describe('createApiKey', () => {
    it('should create API key successfully', async () => {
      const mockApiKey = { id: 'key-1', name: 'Test Key', userId: 'user-1' };
      vi.mocked(generateRandomString).mockReturnValue('raw-key-123');
      vi.mocked(hashString).mockReturnValue('hashed-key');
      mockApiKeyRepository.create.mockResolvedValue(mockApiKey);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.createApiKey('user-1', 'Test Key');
      expect(result.rawKey).toBe('raw-key-123');
    });
  });

  describe('validateApiKey', () => {
    it('should validate valid API key', async () => {
      const mockApiKey = { id: 'key-1', expiresAt: null };
      vi.mocked(hashString).mockReturnValue('hashed-key');
      mockApiKeyRepository.findByKeyHash.mockResolvedValue(mockApiKey);
      mockApiKeyRepository.updateLastUsed.mockResolvedValue(undefined);

      const result = await service.validateApiKey('raw-key');
      expect(result).toEqual(mockApiKey);
    });

    it('should return null for invalid key', async () => {
      vi.mocked(hashString).mockReturnValue('hashed-key');
      mockApiKeyRepository.findByKeyHash.mockResolvedValue(null);

      const result = await service.validateApiKey('invalid-key');
      expect(result).toBeNull();
    });
  });
});
