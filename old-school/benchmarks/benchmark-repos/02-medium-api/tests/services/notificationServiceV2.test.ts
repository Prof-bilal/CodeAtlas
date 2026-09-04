import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../../src/core/notifications/notificationService.js';
import { NotificationRepository } from '../../src/database/repositories/notificationRepository.js';
import { EmailService } from '../../src/core/notifications/emailService.js';
import { EventBus } from '../../src/events/eventBus.js';
import { cacheService } from '../../src/services/cacheService.js';

vi.mock('../../src/database/repositories/notificationRepository.js');
vi.mock('../../src/core/notifications/emailService.js');
vi.mock('../../src/events/eventBus.js');
vi.mock('../../src/services/cacheService.js');

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockNotificationRepository: any;
  let mockEmailService: any;
  let mockEventBus: any;
  let mockCacheService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationRepository = {
      findByUser: vi.fn(),
      getUnreadCount: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteOld: vi.fn(),
    };
    mockEmailService = {
      sendNotification: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
    };
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    notificationService = new NotificationService(
      mockNotificationRepository,
      mockEmailService,
      mockEventBus,
      mockCacheService
    );
  });

  describe('createNotification', () => {
    it('should create notification and send email', async () => {
      const notifData = {
        userId: 'user-1',
        type: 'task_assigned',
        title: 'New Task',
        message: 'You have been assigned a task',
      };
      const mockNotif = { id: 'notif-1', ...notifData, createdAt: new Date() };
      mockNotificationRepository.create.mockResolvedValue(mockNotif);

      const result = await notificationService.createNotification(notifData);

      expect(result).toEqual(mockNotif);
      expect(mockEmailService.sendNotification).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith('notification:created', { notification: mockNotif });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const notifId = 'notif-123';
      const mockNotif = { id: notifId, readAt: null };
      const updatedNotif = { ...mockNotif, readAt: new Date() };
      
      mockNotificationRepository.findById.mockResolvedValue(mockNotif);
      mockNotificationRepository.update.mockResolvedValue(updatedNotif);

      const result = await notificationService.markAsRead(notifId);

      expect(result.readAt).toBeDefined();
      expect(mockEventBus.emit).toHaveBeenCalledWith('notification:read', { notification: updatedNotif });
    });
  });

  describe('deleteOldNotifications', () => {
    it('should delete notifications older than specified days', async () => {
      mockNotificationRepository.deleteOld.mockResolvedValue(5);

      const result = await notificationService.deleteOldNotifications(30);

      expect(result).toBe(5);
      expect(mockNotificationRepository.deleteOld).toHaveBeenCalledWith(30);
    });
  });
});
