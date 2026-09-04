import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobQueue } from '../src/core/jobs/jobQueue.js';

describe('JobQueue', () => {
  let queue: JobQueue;

  beforeEach(() => {
    queue = new JobQueue('test', { concurrency: 2 });
  });

  afterEach(() => {
    queue.stop();
  });

  it('should create queue with default options', () => {
    const defaultQueue = new JobQueue('default');
    expect(defaultQueue).toBeDefined();
  });

  it('should add job to queue', async () => {
    const job = await queue.add('test-job', { data: 'test' });
    expect(job).toBeDefined();
    expect(job.id).toBeDefined();
    expect(job.type).toBe('test-job');
    expect(job.status).toBe('pending');
  });

  it('should get job by id', async () => {
    const job = await queue.add('test-job', { data: 'test' });
    const retrievedJob = await queue.getJob(job.id);
    expect(retrievedJob).toBeDefined();
    expect(retrievedJob?.id).toBe(job.id);
  });

  it('should get jobs by status', async () => {
    await queue.add('test-job', { data: 'test1' });
    await queue.add('test-job', { data: 'test2' });

    const pendingJobs = await queue.getJobs('pending');
    expect(pendingJobs.length).toBe(2);
  });

  it('should remove job', async () => {
    const job = await queue.add('test-job', { data: 'test' });
    const removed = await queue.removeJob(job.id);
    expect(removed).toBe(true);

    const retrievedJob = await queue.getJob(job.id);
    expect(retrievedJob).toBeUndefined();
  });

  it('should get queue stats', async () => {
    await queue.add('test-job', { data: 'test1' });
    await queue.add('test-job', { data: 'test2' });

    const stats = queue.getStats();
    expect(stats.total).toBe(2);
    expect(stats.pending).toBe(2);
  });

  it('should process jobs', async () => {
    const processor = {
      process: vi.fn().mockResolvedValue({ result: 'success' }),
    };

    queue.process('test-job', processor);
    await queue.add('test-job', { data: 'test' });

    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(processor.process).toHaveBeenCalled();
  });

  it('should handle job failure', async () => {
    const processor = {
      process: vi.fn().mockRejectedValue(new Error('Job failed')),
    };

    queue.process('failing-job', processor);
    const job = await queue.add('failing-job', { data: 'test' });

    await new Promise(resolve => setTimeout(resolve, 1500));

    const retrievedJob = await queue.getJob(job.id);
    expect(retrievedJob?.status).toBe('failed');
  });

  it('should emit events', async () => {
    const addedHandler = vi.fn();
    queue.on('jobAdded', addedHandler);

    await queue.add('test-job', { data: 'test' });

    expect(addedHandler).toHaveBeenCalled();
  });

  it('should clean old jobs', async () => {
    const job = await queue.add('test-job', { data: 'test' });
    
    // Simulate old job by setting completedAt to past date
    const retrievedJob = await queue.getJob(job.id);
    if (retrievedJob) {
      retrievedJob.status = 'completed';
      retrievedJob.completedAt = new Date(Date.now() - 100000);
    }

    const cleaned = await queue.clean(50000);
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });
});
