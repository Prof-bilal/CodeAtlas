import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileService } from '../../src/services/fileService.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('FileService', () => {
  let fileService: FileService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    fileService = new FileService(mockEventBus);
  });

  describe('uploadFile', () => {
    it('should store file', async () => {
      const file = await fileService.uploadFile({
        userId: 'user-1',
        filename: 'test.txt',
        originalName: 'test.txt',
        path: '/uploads/test.txt',
        size: 1024,
        mimeType: 'text/plain',
      });
      expect(file.id).toBeDefined();
      expect(file.size).toBe(1024);
    });
  });

  describe('getUserFiles', () => {
    it('should return user files', async () => {
      await fileService.uploadFile({ userId: 'user-1', filename: 'a.txt', originalName: 'a.txt', path: '/a', size: 100, mimeType: 'text/plain' });
      const files = await fileService.getUserFiles('user-1');
      expect(files.length).toBeGreaterThan(0);
    });
  });
});
