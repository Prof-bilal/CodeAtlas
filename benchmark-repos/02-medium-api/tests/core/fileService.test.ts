import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileService } from '../../src/core/files/fileService.js';
import { EventBus } from '../../src/events/eventBus.js';
import fs from 'fs/promises';

vi.mock('../../src/events/eventBus.js');
vi.mock('fs/promises');

describe('FileService', () => {
  let fileService: FileService;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    fileService = new FileService(mockEventBus);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
  });

  describe('uploadFile', () => {
    it('should store file record', async () => {
      const file = await fileService.uploadFile({
        userId: 'user-1',
        filename: 'test.txt',
        originalName: 'test.txt',
        path: '/uploads/test.txt',
        size: 1024,
        mimeType: 'text/plain',
      });

      expect(file.id).toBeDefined();
      expect(file.filename).toBe('test.txt');
    });
  });

  describe('getUserFiles', () => {
    it('should return files for user', async () => {
      await fileService.uploadFile({ userId: 'user-1', filename: 'a.txt', originalName: 'a.txt', path: '/a', size: 100, mimeType: 'text/plain' });
      await fileService.uploadFile({ userId: 'user-2', filename: 'b.txt', originalName: 'b.txt', path: '/b', size: 200, mimeType: 'text/plain' });

      const files = await fileService.getUserFiles('user-1');
      expect(files).toHaveLength(1);
    });
  });

  describe('deleteFile', () => {
    it('should remove file record and disk file', async () => {
      const file = await fileService.uploadFile({ userId: 'user-1', filename: 'test.txt', originalName: 'test.txt', path: '/uploads/test.txt', size: 100, mimeType: 'text/plain' });
      await fileService.deleteFile(file.id);

      const files = await fileService.getUserFiles('user-1');
      expect(files).toHaveLength(0);
      expect(fs.unlink).toHaveBeenCalledWith('/uploads/test.txt');
    });
  });

  describe('getStorageUsage', () => {
    it('should calculate storage usage', async () => {
      await fileService.uploadFile({ userId: 'user-1', filename: 'a.txt', originalName: 'a.txt', path: '/a', size: 500, mimeType: 'text/plain' });
      await fileService.uploadFile({ userId: 'user-1', filename: 'b.txt', originalName: 'b.txt', path: '/b', size: 300, mimeType: 'text/plain' });

      const usage = await fileService.getStorageUsage('user-1');
      expect(usage.used).toBe(800);
      expect(usage.fileCount).toBe(2);
    });
  });
});
