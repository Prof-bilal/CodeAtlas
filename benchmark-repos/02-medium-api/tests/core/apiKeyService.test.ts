import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyService } from '../../src/core/apiKeys/apiKeyService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('ApiKeyService', () => {
  let apiKeyService: ApiKeyService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    apiKeyService = new ApiKeyService(mockEventBus);
  });

  describe('createApiKey', () => {
    it('should create API key with plain text and hash', async () => {
      const { apiKey, plainKey } = await apiKeyService.createApiKey('user-1', 'Test Key', ['read']);

      expect(apiKey.id).toBeDefined();
      expect(apiKey.name).toBe('Test Key');
      expect(plainKey).toMatch(/^sk_/);
      expect(apiKey.keyHash).toBeDefined();
    });
  });

  describe('validateApiKey', () => {
    it('should validate valid key', async () => {
      const { plainKey } = await apiKeyService.createApiKey('user-1', 'Test Key');
      const result = await apiKeyService.validateApiKey(plainKey);
      expect(result).toBeDefined();
      expect(result!.userId).toBe('user-1');
    });

    it('should return null for invalid key', async () => {
      const result = await apiKeyService.validateApiKey('invalid-key');
      expect(result).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke key', async () => {
      const { apiKey } = await apiKeyService.createApiKey('user-1', 'Test Key');
      await apiKeyService.revokeApiKey(apiKey.id);

      const result = await apiKeyService.getUserApiKeys('user-1');
      expect(result[0].active).toBe(false);
    });
  });

  describe('deleteApiKey', () => {
    it('should delete key', async () => {
      const { apiKey } = await apiKeyService.createApiKey('user-1', 'Test Key');
      await apiKeyService.deleteApiKey(apiKey.id);
      const keys = await apiKeyService.getUserApiKeys('user-1');
      expect(keys).toHaveLength(0);
    });
  });

  describe('updatePermissions', () => {
    it('should update permissions', async () => {
      const { apiKey } = await apiKeyService.createApiKey('user-1', 'Test Key', ['read']);
      const updated = await apiKeyService.updatePermissions(apiKey.id, ['read', 'write', 'admin']);
      expect(updated.permissions).toEqual(['read', 'write', 'admin']);
    });
  });
});
