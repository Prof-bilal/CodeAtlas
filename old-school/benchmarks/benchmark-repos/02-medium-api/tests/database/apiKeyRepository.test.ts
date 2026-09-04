import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyRepository } from '../../src/database/repositories/apiKeyRepository.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('ApiKeyRepository', () => {
  let repo: ApiKeyRepository;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    repo = new ApiKeyRepository(mockEventBus);
  });

  describe('create', () => {
    it('should create API key record', async () => {
      const key = await repo.create({ userId: 'user-1', name: 'Test Key', keyHash: 'hash123', permissions: ['read'] });
      expect(key.id).toBeDefined();
      expect(key.active).toBe(true);
    });
  });

  describe('findByUser', () => {
    it('should find keys by user', async () => {
      await repo.create({ userId: 'user-1', name: 'Key 1', keyHash: 'h1', permissions: [] });
      await repo.create({ userId: 'user-2', name: 'Key 2', keyHash: 'h2', permissions: [] });

      const keys = await repo.findByUser('user-1');
      expect(keys).toHaveLength(1);
    });
  });

  describe('revoke', () => {
    it('should revoke key', async () => {
      const key = await repo.create({ userId: 'user-1', name: 'Test', keyHash: 'h', permissions: [] });
      await repo.revoke(key.id);
      const keys = await repo.findByUser('user-1');
      expect(keys[0].active).toBe(false);
    });
  });
});
