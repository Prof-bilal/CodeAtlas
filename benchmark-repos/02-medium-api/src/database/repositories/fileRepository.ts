import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../database/databaseService.js';
import { logger } from '../utils/logger.js';

export interface FileRecord {
  id: string;
  userId: string;
  filename: string;
  originalName: string;
  mimeType?: string;
  size?: number;
  path: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFileInput {
  userId: string;
  filename: string;
  originalName: string;
  mimeType?: string;
  size?: number;
  path: string;
  metadata?: any;
}

export class FileRepository {
  async findById(id: string): Promise<FileRecord | null> {
    const result = await databaseService.query<FileRecord>(
      'SELECT * FROM files WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async create(input: CreateFileInput): Promise<FileRecord> {
    const id = uuidv4();
    const result = await databaseService.query<FileRecord>(
      `INSERT INTO files (id, user_id, filename, original_name, mime_type, size, path, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, input.userId, input.filename, input.originalName, input.mimeType, input.size, input.path, input.metadata ? JSON.stringify(input.metadata) : null]
    );
    return result.rows[0];
  }

  async delete(id: string): Promise<boolean> {
    const result = await databaseService.query(
      'DELETE FROM files WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findByUserId(userId: string, options?: { limit?: number; offset?: number }): Promise<FileRecord[]> {
    let query = 'SELECT * FROM files WHERE user_id = $1';
    const params: any[] = [userId];

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await databaseService.query<FileRecord>(query, params);
    return result.rows;
  }

  async getTotalSize(userId: string): Promise<number> {
    const result = await databaseService.query<{ total: string }>(
      'SELECT COALESCE(SUM(size), 0) as total FROM files WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].total);
  }

  async count(userId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM files';
    const params: any[] = [];

    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }

    const result = await databaseService.query<{ count: string }>(query, params);
    return parseInt(result.rows[0].count);
  }
}

export const fileRepository = new FileRepository();
