import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyService } from '../../src/services/apiKeyService.js';
import { ApiKeyRepository } from '../../src/database/repositories/apiKeyRepository.js';
import { EventBus } from '../../src/events/eventBus.js';
import { cacheService } from '../../src/services/cacheService.js';
import crypto from 'crypto';

vi.mock('../../src/database/repositories/apiKeyRepository.js');
vi.mock('../../src/events/eventBus.js');
vi.mock('../../src/services/cacheService.js');

describe('ApiKeyService', () => {
  let apiKeyService: ApiKeyService;
  let mockApiKeyRepository: any;
  let mockEventBus: any;
  let mockCacheService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiKeyRepository = {
      findByUser: vi.fn(),
      findById: vi.fn(),
      findByKey: vi.fn(),
      create: vi.fn(),
      revoke: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
    };
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    apiKeyService = new ApiKeyService(mockApiKeyRepository, mockEventBus, mockCacheService);
  });

  describe('createApiKey', () => {
    it('should create API key with hashed value', async () => {
      const name = 'Test Key';
      const permissions = ['read', 'write'];
      const userId = 'user-1';
      const mockApiKey = { id: 'key-1', name, permissions, userId, createdAt: new Date() };
      mockApiKeyRepository.create.mockResolvedValue(mockApiKey);

      const result = await apiKeyService.createApiKey(userId, name, permissions);

      expect(result).toEqual(mockApiKey);
      expect(mockEventBus.emit).toHaveBeenCalledWith('apikey:created', { apiKey: mockApiKey });
    });
  });

  describe('validateApiKey', () => {
    it('should validate existing API key', async () => {
      const key = 'test-api-key-123';
      const mockApiKey = { id: 'key-1', userId: 'user-1', active: true };
      mockApiKeyRepository.findByKey.mockResolvedValue(mockApiKey);

      const result = await apiKeyService.validateApiKey(key);

      expect(result).toEqual(mockApiKey);
    });

    it('should return null for invalid API key', async () => {
      const key = 'invalid-key';
      mockApiKeyRepository.findByKey.mockResolvedValue(null);

      const result = await apiKeyService.validateApiKey(key);

      expect(result).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke API key', async () => {
      const keyId = 'key-123';
      mockApiKeyRepository.revoke.mockResolvedValue(true);

      await apiKeyService.revokeApiKey(keyId);

      expect(mockApiKeyRepository.revoke).toHaveBeenCalledWith(keyId);
      expect(mockCacheService.invalidate).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith('apikey:revoked', { keyId });
    });
  });
});
