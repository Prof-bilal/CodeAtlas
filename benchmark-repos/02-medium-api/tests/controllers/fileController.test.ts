import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileController } from '../../src/controllers/fileControllerV2.js';
import { FileService } from '../../src/services/fileService.js';

vi.mock('../../src/services/fileService.js');

describe('FileController', () => {
  let controller: FileController;
  let mockService: any;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      getUserFiles: vi.fn(),
      getFile: vi.fn(),
      uploadFile: vi.fn(),
      deleteFile: vi.fn(),
      getStorageUsage: vi.fn(),
    };
    vi.mocked(FileService).mockImplementation(() => mockService);
    controller = new FileController();
    mockReq = { body: {}, params: {}, user: { id: 'user-1' } } as any;
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn(), download: vi.fn() } as any;
  });

  it('should get files', async () => {
    mockService.getUserFiles.mockResolvedValue([]);
    await controller.getFiles(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith([]);
  });

  it('should get storage usage', async () => {
    mockService.getStorageUsage.mockResolvedValue({ total: 1000, used: 500 });
    await controller.getStorageUsage(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith({ usage: { total: 1000, used: 500 } });
  });
});
