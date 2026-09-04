import { FileRepository } from '../database/repositories/fileRepository.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';

export interface FileService {
  getFile(id: string): Promise<any>;
  getUserFiles(userId: string): Promise<any[]>;
  uploadFile(data: any): Promise<any>;
  deleteFile(id: string): Promise<boolean>;
  getStorageUsage(userId: string): Promise<number>;
}

export class FileServiceImpl implements FileService {
  private fileRepository: FileRepository;

  constructor() {
    this.fileRepository = new FileRepository();
  }

  async getFile(id: string): Promise<any> {
    const file = await this.fileRepository.findById(id);
    if (!file) {
      throw new Error('File not found');
    }
    return file;
  }

  async getUserFiles(userId: string): Promise<any[]> {
    return this.fileRepository.findByUserId(userId);
  }

  async uploadFile(data: any): Promise<any> {
    const file = await this.fileRepository.create(data);

    await eventBus.publish('file.uploaded', {
      fileId: file.id,
      userId: data.userId,
      filename: data.filename,
      originalName: data.originalName,
      size: data.size,
      mimeType: data.mimeType,
    }, 'file-service');

    return file;
  }

  async deleteFile(id: string): Promise<boolean> {
    const file = await this.fileRepository.findById(id);
    if (!file) {
      throw new Error('File not found');
    }

    const deleted = await this.fileRepository.delete(id);

    await eventBus.publish('file.deleted', {
      fileId: id,
      userId: file.userId,
      filename: file.filename,
    }, 'file-service');

    return deleted;
  }

  async getStorageUsage(userId: string): Promise<number> {
    return this.fileRepository.getTotalSize(userId);
  }
}

export const fileService = new FileServiceImpl();
