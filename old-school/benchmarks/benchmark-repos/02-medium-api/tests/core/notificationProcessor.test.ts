import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationProcessor } from '../../src/core/jobs/notificationProcessor.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    processor = new NotificationProcessor(mockEventBus);
  });

  it('should queue notification', async () => {
    const jobId = await processor.queueNotification('user-1', 'test', 'Title', 'Message');
    expect(jobId).toBeDefined();
  });
});
