import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { EventBus } from '../../events/eventBus.js';
import { cacheService } from '../../services/cacheService.js';
import fs from 'fs/promises';
import path from 'path';

export interface FileRecord {
  id: string;
  userId: string;
  filename: string;
  originalName: string;
  path: string;
  size: number;
  mimeType: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface UploadFileData {
  userId: string;
  filename: string;
  originalName: string;
  path: string;
  size: number;
  mimeType: string;
}

export interface StorageUsage {
  total: number;
  used: number;
  fileCount: number;
}

export class FileService {
  private files: FileRecord[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async uploadFile(data: UploadFileData): Promise<FileRecord> {
    const file: FileRecord = {
      id: uuidv4(),
      ...data,
      metadata: {},
      createdAt: new Date(),
    };

    this.files.push(file);
    await cacheService.invalidate(`files:${data.userId}`);
    this.eventBus.emit('file:uploaded', { file });

    return file;
  }

  async getFile(id: string): Promise<FileRecord> {
    const file = this.files.find(f => f.id === id);
    if (!file) {
      throw new Error('File not found');
    }
    return file;
  }

  async getUserFiles(userId: string): Promise<FileRecord[]> {
    return this.files.filter(f => f.userId === userId);
  }

  async deleteFile(id: string): Promise<void> {
    const file = await this.getFile(id);
    
    try {
      await fs.unlink(file.path);
    } catch (error) {
      logger.warn(`Failed to delete file from disk: ${file.path}`);
    }

    const index = this.files.findIndex(f => f.id === id);
    this.files.splice(index, 1);

    await cacheService.invalidate(`files:${file.userId}`);
    this.eventBus.emit('file:deleted', { fileId: id });
  }

  async getStorageUsage(userId: string): Promise<StorageUsage> {
    const userFiles = this.files.filter(f => f.userId === userId);
    return {
      total: 1024 * 1024 * 1024, // 1GB default
      used: userFiles.reduce((sum, f) => sum + f.size, 0),
      fileCount: userFiles.length,
    };
  }

  async getFileInfo(id: string): Promise<{ exists: boolean; size?: number; lastModified?: Date }> {
    try {
      const file = await this.getFile(id);
      const stats = await fs.stat(file.path);
      return { exists: true, size: stats.size, lastModified: stats.mtime };
    } catch {
      return { exists: false };
    }
  }
}

export const fileService = new FileService(new EventBus());
