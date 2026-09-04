import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../src/services/notificationService.js';
import { notificationRepository } from '../src/repositories/notificationRepository.js';

vi.mock('../src/repositories/notificationRepository.js');

describe('NotificationService', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    notificationService = new NotificationService();
    vi.clearAllMocks();
  });

  const mockNotification = {
    id: 'notif-123',
    userId: 'user-123',
    type: 'in_app' as const,
    category: 'system' as const,
    title: 'Test Notification',
    message: 'This is a test notification',
    data: null,
    readAt: null,
    createdAt: new Date(),
  };

  describe('getNotifications', () => {
    it('should return paginated notifications', async () => {
      vi.mocked(notificationRepository.findByUserId).mockResolvedValue([mockNotification]);
      vi.mocked(notificationRepository.countByUserId).mockResolvedValue(1);
      vi.mocked(notificationRepository.countUnreadByUserId).mockResolvedValue(1);

      const result = await notificationService.getNotifications('user-123', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      vi.mocked(notificationRepository.findById).mockResolvedValue(mockNotification);
      vi.mocked(notificationRepository.markAsRead).mockResolvedValue(undefined);

      await notificationService.markAsRead('notif-123', 'user-123');

      expect(notificationRepository.markAsRead).toHaveBeenCalledWith('notif-123');
    });

    it('should throw error when notification not found', async () => {
      vi.mocked(notificationRepository.findById).mockResolvedValue(null);

      await expect(
        notificationService.markAsRead('nonexistent', 'user-123')
      ).rejects.toThrow('Notification not found');
    });

    it('should throw error when user does not own notification', async () => {
      vi.mocked(notificationRepository.findById).mockResolvedValue({
        ...mockNotification,
        userId: 'other-user',
      });

      await expect(
        notificationService.markAsRead('notif-123', 'user-123')
      ).rejects.toThrow('Access denied');
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      vi.mocked(notificationRepository.markAllAsRead).mockResolvedValue(undefined);

      await notificationService.markAllAsRead('user-123');

      expect(notificationRepository.markAllAsRead).toHaveBeenCalledWith('user-123');
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification', async () => {
      vi.mocked(notificationRepository.findById).mockResolvedValue(mockNotification);
      vi.mocked(notificationRepository.delete).mockResolvedValue(undefined);

      await notificationService.deleteNotification('notif-123', 'user-123');

      expect(notificationRepository.delete).toHaveBeenCalledWith('notif-123');
    });

    it('should throw error when notification not found', async () => {
      vi.mocked(notificationRepository.findById).mockResolvedValue(null);

      await expect(
        notificationService.deleteNotification('nonexistent', 'user-123')
      ).rejects.toThrow('Notification not found');
    });
  });
});
