import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportProcessor } from '../../src/core/jobs/reportProcessor.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('ReportProcessor', () => {
  let processor: ReportProcessor;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    processor = new ReportProcessor(mockEventBus);
  });

  it('should queue report', async () => {
    const jobId = await processor.queueReport('report-1', 'json', ['admin@example.com']);
    expect(jobId).toBeDefined();
  });
});
