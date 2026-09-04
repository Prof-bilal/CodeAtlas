import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataProcessor } from '../../src/core/jobs/dataProcessor.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('DataProcessor', () => {
  let processor: DataProcessor;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    processor = new DataProcessor(mockEventBus);
  });

  it('should queue export job', async () => {
    const jobId = await processor.queueJob('export', { source: 'users', format: 'csv' });
    expect(jobId).toBeDefined();
  });

  it('should queue import job', async () => {
    const jobId = await processor.queueJob('import', { source: '/data/import.csv', format: 'csv' });
    expect(jobId).toBeDefined();
  });
});
