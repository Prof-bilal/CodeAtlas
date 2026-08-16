import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../database/databaseService.js';
import { logger } from '../utils/logger.js';

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  permissions: string[];
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  keyHash: string;
  permissions?: string[];
  expiresAt?: Date;
}

export class ApiKeyRepository {
  async findById(id: string): Promise<ApiKey | null> {
    const result = await databaseService.query<ApiKey>(
      'SELECT * FROM api_keys WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const result = await databaseService.query<ApiKey>(
      'SELECT * FROM api_keys WHERE key_hash = $1',
      [keyHash]
    );
    return result.rows[0] || null;
  }

  async create(input: CreateApiKeyInput): Promise<ApiKey> {
    const id = uuidv4();
    const result = await databaseService.query<ApiKey>(
      `INSERT INTO api_keys (id, user_id, name, key_hash, permissions, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, input.userId, input.name, input.keyHash, input.permissions || [], input.expiresAt]
    );
    return result.rows[0];
  }

  async updateLastUsed(id: string): Promise<void> {
    await databaseService.query(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await databaseService.query(
      'DELETE FROM api_keys WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findByUserId(userId: string): Promise<ApiKey[]> {
    const result = await databaseService.query<ApiKey>(
      'SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async count(userId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM api_keys';
    const params: any[] = [];

    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }

    const result = await databaseService.query<{ count: string }>(query, params);
    return parseInt(result.rows[0].count);
  }
}

export const apiKeyRepository = new ApiKeyRepository();
