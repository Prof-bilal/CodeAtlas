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
    });
  });
});
