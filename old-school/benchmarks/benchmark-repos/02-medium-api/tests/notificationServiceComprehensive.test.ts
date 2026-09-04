import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationServiceImpl } from '../src/services/notificationService.js';
import { NotificationRepository } from '../src/database/repositories/notificationRepository.js';
import { eventBus } from '../src/events/eventBus.js';

vi.mock('../src/database/repositories/notificationRepository.js');
vi.mock('../src/events/eventBus.js');

describe('NotificationServiceImpl', () => {
  let service: NotificationServiceImpl;
  let mockNotificationRepository: any;

  beforeEach(() => {
    service = new NotificationServiceImpl();
    mockNotificationRepository = vi.mocked(NotificationRepository.prototype);
    vi.clearAllMocks();
  });

  describe('getNotification', () => {
    it('should return notification if found', async () => {
      const mockNotification = { id: 'notif-1', title: 'Test' };
      mockNotificationRepository.findById.mockResolvedValue(mockNotification);

      const result = await service.getNotification('notif-1');
      expect(result).toEqual(mockNotification);
    });

    it('should throw error if notification not found', async () => {
      mockNotificationRepository.findById.mockResolvedValue(null);

      await expect(service.getNotification('notif-1')).rejects.toThrow('Notification not found');
    });
  });

  describe('getUserNotifications', () => {
    it('should return user notifications', async () => {
      const mockNotifications = [{ id: 'notif-1' }, { id: 'notif-2' }];
      mockNotificationRepository.findByUserId.mockResolvedValue(mockNotifications);

      const result = await service.getUserNotifications('user-1');
      expect(result).toEqual(mockNotifications);
    });
  });

  describe('createNotification', () => {
    it('should create notification successfully', async () => {
      const mockNotification = { id: 'notif-1', title: 'Test', userId: 'user-1' };
      mockNotificationRepository.create.mockResolvedValue(mockNotification);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.createNotification({
        userId: 'user-1',
        type: 'info',
        title: 'Test',
      });

      expect(result).toEqual(mockNotification);
      expect(mockNotificationRepository.create).toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const mockNotification = { id: 'notif-1', read: false };
      mockNotificationRepository.findById.mockResolvedValue(mockNotification);
      mockNotificationRepository.markAsRead.mockResolvedValue({ ...mockNotification, read: true });
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.markAsRead('notif-1');
      expect(result.read).toBe(true);
    });

    it('should throw error if notification not found', async () => {
      mockNotificationRepository.findById.mockResolvedValue(null);

      await expect(service.markAsRead('notif-1')).rejects.toThrow('Notification not found');
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all as read', async () => {
      mockNotificationRepository.markAllAsRead.mockResolvedValue(5);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.markAllAsRead('user-1');
      expect(result).toBe(5);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockNotificationRepository.countUnread.mockResolvedValue(3);

      const result = await service.getUnreadCount('user-1');
      expect(result).toBe(3);
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification successfully', async () => {
      const mockNotification = { id: 'notif-1' };
      mockNotificationRepository.findById.mockResolvedValue(mockNotification);
      mockNotificationRepository.delete.mockResolvedValue(true);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.deleteNotification('notif-1');
      expect(result).toBe(true);
    });

    it('should throw error if notification not found', async () => {
      mockNotificationRepository.findById.mockResolvedValue(null);

      await expect(service.deleteNotification('notif-1')).rejects.toThrow('Notification not found');
    });
  });

  describe('deleteOldNotifications', () => {
    it('should delete old notifications', async () => {
      mockNotificationRepository.deleteOlderThan.mockResolvedValue(10);

      const result = await service.deleteOldNotifications(30);
      expect(result).toBe(10);
    });
  });
});
