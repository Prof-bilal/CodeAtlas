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

  describe('getApiKey', () => {
    it('should return API key if found', async () => {
      const mockApiKey = { id: 'key-1', name: 'Test Key' };
      mockApiKeyRepository.findById.mockResolvedValue(mockApiKey);

      const result = await service.getApiKey('key-1');
      expect(result).toEqual(mockApiKey);
    });

    it('should throw error if API key not found', async () => {
      mockApiKeyRepository.findById.mockResolvedValue(null);

      await expect(service.getApiKey('key-1')).rejects.toThrow('API key not found');
    });
  });

  describe('getUserApiKeys', () => {
    it('should return user API keys', async () => {
      const mockApiKeys = [{ id: 'key-1' }, { id: 'key-2' }];
      mockApiKeyRepository.findByUserId.mockResolvedValue(mockApiKeys);

      const result = await service.getUserApiKeys('user-1');
      expect(result).toEqual(mockApiKeys);
    });
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
      expect(result.name).toBe('Test Key');
      expect(mockApiKeyRepository.create).toHaveBeenCalled();
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
      expect(mockApiKeyRepository.updateLastUsed).toHaveBeenCalledWith('key-1');
    });

    it('should return null for invalid key', async () => {
      vi.mocked(hashString).mockReturnValue('hashed-key');
      mockApiKeyRepository.findByKeyHash.mockResolvedValue(null);

      const result = await service.validateApiKey('invalid-key');
      expect(result).toBeNull();
    });

    it('should return null for expired key', async () => {
      const mockApiKey = { id: 'key-1', expiresAt: new Date('2020-01-01') };
      vi.mocked(hashString).mockReturnValue('hashed-key');
      mockApiKeyRepository.findByKeyHash.mockResolvedValue(mockApiKey);

      const result = await service.validateApiKey('expired-key');
      expect(result).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke API key successfully', async () => {
      const mockApiKey = { id: 'key-1', userId: 'user-1' };
      mockApiKeyRepository.findById.mockResolvedValue(mockApiKey);
      mockApiKeyRepository.delete.mockResolvedValue(true);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.revokeApiKey('key-1');
      expect(result).toBe(true);
      expect(mockApiKeyRepository.delete).toHaveBeenCalledWith('key-1');
    });

    it('should throw error if API key not found', async () => {
      mockApiKeyRepository.findById.mockResolvedValue(null);

      await expect(service.revokeApiKey('key-1')).rejects.toThrow('API key not found');
    });
  });
});
