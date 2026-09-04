import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailProcessor } from '../../src/core/jobs/emailProcessor.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    processor = new EmailProcessor(mockEventBus);
  });

  it('should queue email', async () => {
    const jobId = await processor.queueEmail('test@example.com', 'Hello', '<p>Hi</p>');
    expect(jobId).toBeDefined();
  });
});
