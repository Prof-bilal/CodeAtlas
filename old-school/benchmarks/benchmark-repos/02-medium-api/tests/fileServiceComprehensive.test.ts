import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileServiceImpl } from '../src/services/fileService.js';
import { FileRepository } from '../src/database/repositories/fileRepository.js';
import { eventBus } from '../src/events/eventBus.js';

vi.mock('../src/database/repositories/fileRepository.js');
vi.mock('../src/events/eventBus.js');

describe('FileServiceImpl', () => {
  let service: FileServiceImpl;
  let mockFileRepository: any;

  beforeEach(() => {
    service = new FileServiceImpl();
    mockFileRepository = vi.mocked(FileRepository.prototype);
    vi.clearAllMocks();
  });

  describe('getFile', () => {
    it('should return file if found', async () => {
      const mockFile = { id: 'file-1', filename: 'test.txt' };
      mockFileRepository.findById.mockResolvedValue(mockFile);

      const result = await service.getFile('file-1');
      expect(result).toEqual(mockFile);
    });

    it('should throw error if file not found', async () => {
      mockFileRepository.findById.mockResolvedValue(null);

      await expect(service.getFile('file-1')).rejects.toThrow('File not found');
    });
  });

  describe('getUserFiles', () => {
    it('should return user files', async () => {
      const mockFiles = [{ id: 'file-1' }, { id: 'file-2' }];
      mockFileRepository.findByUserId.mockResolvedValue(mockFiles);

      const result = await service.getUserFiles('user-1');
      expect(result).toEqual(mockFiles);
    });
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const mockFile = { id: 'file-1', filename: 'test.txt', userId: 'user-1' };
      mockFileRepository.create.mockResolvedValue(mockFile);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.uploadFile({
        userId: 'user-1',
        filename: 'test.txt',
        originalName: 'test.txt',
        path: '/uploads/test.txt',
        size: 1024,
        mimeType: 'text/plain',
      });

      expect(result).toEqual(mockFile);
      expect(mockFileRepository.create).toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const mockFile = { id: 'file-1', filename: 'test.txt', userId: 'user-1' };
      mockFileRepository.findById.mockResolvedValue(mockFile);
      mockFileRepository.delete.mockResolvedValue(true);
      vi.mocked(eventBus.publish).mockResolvedValue(undefined);

      const result = await service.deleteFile('file-1');
      expect(result).toBe(true);
      expect(mockFileRepository.delete).toHaveBeenCalledWith('file-1');
    });

    it('should throw error if file not found', async () => {
      mockFileRepository.findById.mockResolvedValue(null);

      await expect(service.deleteFile('file-1')).rejects.toThrow('File not found');
    });
  });

  describe('getStorageUsage', () => {
    it('should return storage usage', async () => {
      mockFileRepository.getTotalSize.mockResolvedValue(1024 * 1024);

      const result = await service.getStorageUsage('user-1');
      expect(result).toBe(1024 * 1024);
    });
  });
});
