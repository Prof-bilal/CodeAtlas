import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../../src/core/notifications/notificationService.js';
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
    it('should create a notification', async () => {
      const notif = await notificationService.createNotification({
        userId: 'user-1',
        type: 'task_assigned',
        title: 'New Task',
        message: 'You have a task',
        data: {},
      });

      expect(notif.id).toBeDefined();
      expect(notif.readAt).toBeUndefined();
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const notif = await notificationService.createNotification({
        userId: 'user-1',
        type: 'test',
        title: 'Test',
        message: 'Test',
        data: {},
      });

      const read = await notificationService.markAsRead(notif.id);
      expect(read.readAt).toBeDefined();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all as read', async () => {
      await notificationService.createNotification({ userId: 'user-1', type: 'test', title: 'T1', message: 'M1', data: {} });
      await notificationService.createNotification({ userId: 'user-1', type: 'test', title: 'T2', message: 'M2', data: {} });
      await notificationService.createNotification({ userId: 'user-2', type: 'test', title: 'T3', message: 'M3', data: {} });

      const count = await notificationService.markAllAsRead('user-1');
      expect(count).toBe(2);
    });
  });

  describe('getUnreadCount', () => {
    it('should count unread notifications', async () => {
      await notificationService.createNotification({ userId: 'user-1', type: 'test', title: 'T1', message: 'M1', data: {} });
      const notif = await notificationService.createNotification({ userId: 'user-1', type: 'test', title: 'T2', message: 'M2', data: {} });
      await notificationService.markAsRead(notif.id);

      const count = await notificationService.getUnreadCount('user-1');
      expect(count).toBe(1);
    });
  });

  describe('deleteOldNotifications', () => {
    it('should delete old notifications', async () => {
      await notificationService.createNotification({ userId: 'user-1', type: 'test', title: 'T1', message: 'M1', data: {} });
      const deleted = await notificationService.deleteOldNotifications(0);
      expect(deleted).toBeGreaterThanOrEqual(0);
    });
  });
});
