import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyService } from '../../src/services/apiKeyService.js';
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
    it('should create API key', async () => {
      const { apiKey, plainKey } = await apiKeyService.createApiKey('user-1', 'Test', ['read']);
      expect(apiKey.id).toBeDefined();
      expect(plainKey).toMatch(/^sk_/);
    });
  });

  describe('validateApiKey', () => {
    it('should validate key', async () => {
      const { plainKey } = await apiKeyService.createApiKey('user-1', 'Test');
      const result = await apiKeyService.validateApiKey(plainKey);
      expect(result).toBeDefined();
    });
  });
});
