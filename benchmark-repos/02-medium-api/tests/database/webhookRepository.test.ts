import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookRepository } from '../../src/database/repositories/webhookRepository.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('WebhookRepository', () => {
  let repo: WebhookRepository;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    repo = new WebhookRepository(mockEventBus);
  });

  describe('create', () => {
    it('should create webhook record', async () => {
      const webhook = await repo.create({ userId: 'user-1', url: 'https://example.com/hook', events: ['test'] });
      expect(webhook.id).toBeDefined();
      expect(webhook.active).toBe(true);
    });
  });

  describe('findByUser', () => {
    it('should find webhooks by user', async () => {
      await repo.create({ userId: 'user-1', url: 'https://example.com/hook1', events: [] });
      await repo.create({ userId: 'user-2', url: 'https://example.com/hook2', events: [] });

      const webhooks = await repo.findByUser('user-1');
      expect(webhooks).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update webhook', async () => {
      const webhook = await repo.create({ userId: 'user-1', url: 'https://old.com', events: [] });
      const updated = await repo.update(webhook.id, { url: 'https://new.com' });
      expect(updated.url).toBe('https://new.com');
    });
  });
});
