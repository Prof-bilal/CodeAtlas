import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookProcessor } from '../../src/core/jobs/webhookProcessor.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('WebhookProcessor', () => {
  let processor: WebhookProcessor;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    processor = new WebhookProcessor(mockEventBus);
  });

  it('should queue webhook', async () => {
    const jobId = await processor.queueWebhook('wh-1', 'task.created', { taskId: '123' });
    expect(jobId).toBeDefined();
  });
});
