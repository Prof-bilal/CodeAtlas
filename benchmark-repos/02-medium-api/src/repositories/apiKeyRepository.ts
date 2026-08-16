import { query, queryOne } from '../config/database.js';
import { ApiKey } from '../models/index.js';

export class ApiKeyRepository {
  async findById(id: string): Promise<ApiKey | null> {
    const row = await queryOne<any>(
      'SELECT * FROM api_keys WHERE id = $1',
      [id]
    );
    
    if (!row) return null;
    
    return this.mapRowToApiKey(row);
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const row = await queryOne<any>(
      'SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true',
      [keyHash]
    );
    
    if (!row) return null;
    
    return this.mapRowToApiKey(row);
  }

  async create(input: {
    userId: string;
    name: string;
    key: string;
    keyHash: string;
    permissions: string[];
    expiresAt?: Date;
  }): Promise<ApiKey> {
    const row = await queryOne<any>(
      `INSERT INTO api_keys (user_id, name, key, key_hash, permissions, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.userId,
        input.name,
        input.key,
        input.keyHash,
        JSON.stringify(input.permissions),
        input.expiresAt || null,
      ]
    );
    
    return this.mapRowToApiKey(row!);
  }

  async updateLastUsed(id: string): Promise<void> {
    await query(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  async deactivate(id: string): Promise<void> {
    await query(
      'UPDATE api_keys SET is_active = false WHERE id = $1',
      [id]
    );
  }

  async delete(id: string): Promise<void> {
    await query(
      'DELETE FROM api_keys WHERE id = $1',
      [id]
    );
  }

  async findByUserId(userId: string): Promise<ApiKey[]> {
    const rows = await query<any>(
      'SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    return rows.map(this.mapRowToApiKey);
  }

  async countByUserId(userId: string): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1',
      [userId]
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async deleteExpired(): Promise<number> {
    const result = await query(
      'DELETE FROM api_keys WHERE expires_at < CURRENT_TIMESTAMP'
    );
    
    return result.length;
  }

  private mapRowToApiKey(row: any): ApiKey {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      key: row.key,
      keyHash: row.key_hash,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
    };
  }
}

export const apiKeyRepository = new ApiKeyRepository();
