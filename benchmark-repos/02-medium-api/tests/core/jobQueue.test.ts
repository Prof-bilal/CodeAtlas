import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobQueue } from '../../src/core/jobs/jobQueue.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('JobQueue', () => {
  let jobQueue: JobQueue;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    jobQueue = new JobQueue(mockEventBus);
  });

  describe('addJob', () => {
    it('should add a job to queue', async () => {
      const job = await jobQueue.addJob('email', { to: 'test@example.com', subject: 'Hello' });
      expect(job.id).toBeDefined();
      expect(job.status).toBe('pending');
      expect(job.type).toBe('email');
    });
  });

  describe('processNext', () => {
    it('should process next pending job', async () => {
      await jobQueue.addJob('email', { to: 'test@example.com' });
      const processed = await jobQueue.processNext();
      expect(processed).toBeDefined();
      expect(processed!.status).toBe('completed');
    });

    it('should return null when no pending jobs', async () => {
      const result = await jobQueue.processNext();
      expect(result).toBeNull();
    });
  });

  describe('retryJob', () => {
    it('should retry a failed job', async () => {
      const job = await jobQueue.addJob('email', { to: 'test@example.com' });
      // Simulate failure
      await jobQueue.processNext(); // This will fail because processEmailJob fails
      
      const retry = await jobQueue.retryJob(job.id);
      expect(retry).toBeDefined();
      expect(retry!.status).toBe('pending');
    });
  });

  describe('clearCompleted', () => {
    it('should clear completed jobs', async () => {
      await jobQueue.addJob('email', { to: 'test1@example.com' });
      await jobQueue.addJob('email', { to: 'test2@example.com' });
      await jobQueue.processNext();
      await jobQueue.processNext();

      const cleared = await jobQueue.clearCompleted();
      expect(cleared).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return queue stats', async () => {
      await jobQueue.addJob('email', {});
      const stats = await jobQueue.getStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
    });
  });
});
