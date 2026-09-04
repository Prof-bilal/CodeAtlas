import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationController } from '../../src/controllers/notificationControllerV2.js';
import { NotificationService } from '../../src/core/notifications/notificationService.js';

vi.mock('../../src/core/notifications/notificationService.js');

describe('NotificationController', () => {
  let controller: NotificationController;
  let mockService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      getUserNotifications: vi.fn(),
      getNotification: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      deleteNotification: vi.fn(),
      getUnreadCount: vi.fn(),
      deleteOldNotifications: vi.fn(),
    };
    vi.mocked(NotificationService).mockImplementation(() => mockService);
    controller = new NotificationController();
    mockReq = { body: {}, params: {}, query: {}, user: { id: 'user-1' } } as any;
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn() } as any;
  });

  it('should get notifications', async () => {
    mockService.getUserNotifications.mockResolvedValue([]);
    await controller.getNotifications(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith([]);
  });

  it('should get unread count', async () => {
    mockService.getUnreadCount.mockResolvedValue(5);
    await controller.getUnreadCount(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith({ count: 5 });
  });
});
