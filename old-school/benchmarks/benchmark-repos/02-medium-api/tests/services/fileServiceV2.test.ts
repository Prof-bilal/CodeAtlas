import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileService } from '../../src/services/fileService.js';
import { FileRepository } from '../../src/database/repositories/fileRepository.js';
import { EventBus } from '../../src/events/eventBus.js';
import { cacheService } from '../../src/services/cacheService.js';
import fs from 'fs/promises';

vi.mock('../../src/database/repositories/fileRepository.js');
vi.mock('../../src/events/eventBus.js');
vi.mock('../../src/services/cacheService.js');
vi.mock('fs/promises');

describe('FileService', () => {
  let fileService: FileService;
  let mockFileRepository: any;
  let mockEventBus: any;
  let mockCacheService: any;
  let mockFs: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFileRepository = {
      findByUser: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      getStorageUsage: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
    };
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    fileService = new FileService(mockFileRepository, mockEventBus, mockCacheService);
  });

  describe('uploadFile', () => {
    it('should upload file and create record', async () => {
      const fileData = {
        userId: 'user-1',
        filename: 'test.txt',
        originalName: 'test.txt',
        path: '/uploads/test.txt',
        size: 1024,
        mimeType: 'text/plain',
      };
      const mockFile = { id: 'file-1', ...fileData, createdAt: new Date() };
      mockFileRepository.create.mockResolvedValue(mockFile);

      const result = await fileService.uploadFile(fileData);

      expect(result).toEqual(mockFile);
      expect(mockEventBus.emit).toHaveBeenCalledWith('file:uploaded', { file: mockFile });
      expect(mockCacheService.invalidate).toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete file record and emit event', async () => {
      const fileId = 'file-123';
      const mockFile = { id: fileId, path: '/uploads/test.txt' };
      mockFileRepository.findById.mockResolvedValue(mockFile);
      mockFileRepository.delete.mockResolvedValue(true);
      mockFs.unlink.mockResolvedValue(undefined);

      await fileService.deleteFile(fileId);

      expect(mockFs.unlink).toHaveBeenCalledWith('/uploads/test.txt');
      expect(mockEventBus.emit).toHaveBeenCalledWith('file:deleted', { fileId });
      expect(mockCacheService.invalidate).toHaveBeenCalled();
    });
  });

  describe('getStorageUsage', () => {
    it('should return storage usage from cache', async () => {
      const userId = 'user-123';
      const mockUsage = { total: 1024, used: 512 };
      mockCacheService.get.mockResolvedValue(mockUsage);

      const result = await fileService.getStorageUsage(userId);

      expect(result).toEqual(mockUsage);
      expect(mockFileRepository.getStorageUsage).not.toHaveBeenCalled();
    });

    it('should fetch from repository when cache misses', async () => {
      const userId = 'user-123';
      const mockUsage = { total: 1024, used: 512 };
      mockCacheService.get.mockResolvedValue(null);
      mockFileRepository.getStorageUsage.mockResolvedValue(mockUsage);

      const result = await fileService.getStorageUsage(userId);

      expect(result).toEqual(mockUsage);
      expect(mockCacheService.set).toHaveBeenCalledWith(`storage:${userId}`, mockUsage, 600);
    });
  });
});
