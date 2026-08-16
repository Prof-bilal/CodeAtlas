import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookController } from '../../src/controllers/webhookControllerV2.js';
import { WebhookService } from '../../src/services/webhookService.js';

vi.mock('../../src/services/webhookService.js');

describe('WebhookController', () => {
  let controller: WebhookController;
  let mockService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      getUserWebhooks: vi.fn(),
      getWebhook: vi.fn(),
      createWebhook: vi.fn(),
      updateWebhook: vi.fn(),
      deleteWebhook: vi.fn(),
      testWebhook: vi.fn(),
      getWebhookLogs: vi.fn(),
    };
    vi.mocked(WebhookService).mockImplementation(() => mockService);
    controller = new WebhookController();
    mockReq = { body: {}, params: {}, user: { id: 'user-1' } } as any;
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn() } as any;
  });

  it('should get webhooks', async () => {
    mockService.getUserWebhooks.mockResolvedValue([]);
    await controller.getWebhooks(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith([]);
  });

  it('should create webhook', async () => {
    mockReq.body = { url: 'https://example.com/hook', events: ['test'] };
    mockService.createWebhook.mockResolvedValue({ id: 'wh-1' });
    await controller.createWebhook(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(201);
  });
});
