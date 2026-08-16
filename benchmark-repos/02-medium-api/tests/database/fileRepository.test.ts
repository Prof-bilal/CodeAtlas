import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileRepository } from '../../src/database/repositories/fileRepository.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('FileRepository', () => {
  let repo: FileRepository;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    repo = new FileRepository(mockEventBus);
  });

  describe('create', () => {
    it('should create file record', async () => {
      const file = await repo.create({ userId: 'user-1', filename: 'test.txt', originalName: 'test.txt', path: '/uploads/test.txt', size: 1024, mimeType: 'text/plain' });
      expect(file.id).toBeDefined();
      expect(file.size).toBe(1024);
    });
  });

  describe('findByUser', () => {
    it('should find files by user', async () => {
      await repo.create({ userId: 'user-1', filename: 'a.txt', originalName: 'a.txt', path: '/a', size: 100, mimeType: 'text/plain' });
      await repo.create({ userId: 'user-2', filename: 'b.txt', originalName: 'b.txt', path: '/b', size: 200, mimeType: 'text/plain' });

      const files = await repo.findByUser('user-1');
      expect(files).toHaveLength(1);
    });
  });

  describe('getStorageUsage', () => {
    it('should calculate usage', async () => {
      await repo.create({ userId: 'user-1', filename: 'a.txt', originalName: 'a.txt', path: '/a', size: 500, mimeType: 'text/plain' });
      const usage = await repo.getStorageUsage('user-1');
      expect(usage.total).toBeGreaterThan(0);
      expect(usage.used).toBe(500);
    });
  });
});
