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
  });
});
