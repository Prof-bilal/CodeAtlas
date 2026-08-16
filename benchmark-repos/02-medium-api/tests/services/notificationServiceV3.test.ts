import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../../src/services/notificationService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    notificationService = new NotificationService(mockEventBus);
  });

  describe('createNotification', () => {
    it('should create notification', async () => {
      const notif = await notificationService.createNotification({
        userId: 'user-1',
        type: 'test',
        title: 'Test',
        message: 'Hello',
        data: {},
      });
      expect(notif.id).toBeDefined();
    });
  });

  describe('getUnreadCount', () => {
    it('should count unread', async () => {
      const count = await notificationService.getUnreadCount('user-1');
      expect(count).toBe(0);
    });
  });
});
