import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationRepository } from '../../src/database/repositories/notificationRepository.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('NotificationRepository', () => {
  let repo: NotificationRepository;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    repo = new NotificationRepository(mockEventBus);
  });

  describe('create', () => {
    it('should create notification record', async () => {
      const notif = await repo.create({ userId: 'user-1', type: 'test', title: 'Hello', message: 'World' });
      expect(notif.id).toBeDefined();
      expect(notif.readAt).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should find notifications by user', async () => {
      await repo.create({ userId: 'user-1', type: 'test', title: 'T1', message: 'M1' });
      await repo.create({ userId: 'user-2', type: 'test', title: 'T2', message: 'M2' });

      const notifs = await repo.findByUser('user-1');
      expect(notifs).toHaveLength(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const notif = await repo.create({ userId: 'user-1', type: 'test', title: 'T', message: 'M' });
      const read = await repo.markAsRead(notif.id);
      expect(read.readAt).not.toBeNull();
    });
  });
});
