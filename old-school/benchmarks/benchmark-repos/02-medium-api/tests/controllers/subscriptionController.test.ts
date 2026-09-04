import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionController } from '../../src/controllers/subscriptionControllerV2.js';
import { SubscriptionService } from '../../src/core/subscriptions/subscriptionService.js';

vi.mock('../../src/core/subscriptions/subscriptionService.js');

describe('SubscriptionController', () => {
  let controller: SubscriptionController;
  let mockService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      getUserSubscription: vi.fn(),
      getSubscription: vi.fn(),
      createSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      renewSubscription: vi.fn(),
      upgradeSubscription: vi.fn(),
      downgradeSubscription: vi.fn(),
      getExpiringSoon: vi.fn(),
    };
    vi.mocked(SubscriptionService).mockImplementation(() => mockService);
    controller = new SubscriptionController();
    mockReq = { body: {}, params: {}, query: {}, user: { id: 'user-1' } } as any;
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  });

  it('should get subscription', async () => {
    mockService.getUserSubscription.mockResolvedValue({ id: 'sub-1' });
    await controller.getSubscription(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith({ id: 'sub-1' });
  });

  it('should create subscription', async () => {
    mockReq.body = { planId: 'pro', currentPeriodStart: new Date().toISOString(), currentPeriodEnd: new Date().toISOString() };
    mockService.createSubscription.mockResolvedValue({ id: 'sub-1' });
    await controller.createSubscription(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(201);
  });
});
