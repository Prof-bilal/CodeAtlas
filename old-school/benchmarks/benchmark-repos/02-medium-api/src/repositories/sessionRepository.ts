import { query, queryOne } from '../config/database.js';
import { Session } from '../models/index.js';
import { v4 as uuidv4 } from 'uuid';

export class SessionRepository {
  async create(userId: string, token: string, expiresAt: Date): Promise<Session> {
    const row = await queryOne<any>(
      `INSERT INTO sessions (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, token, expiresAt]
    );
    
    return this.mapRowToSession(row!);
  }

  async findByToken(token: string): Promise<Session | null> {
    const row = await queryOne<any>(
      'SELECT * FROM sessions WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
      [token]
    );
    
    return row ? this.mapRowToSession(row) : null;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const rows = await query<any>(
      'SELECT * FROM sessions WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC',
      [userId]
    );
    
    return rows.map(this.mapRowToSession);
  }

  async delete(token: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM sessions WHERE token = $1',
      [token]
    );
    
    return result.length > 0;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await query(
      'DELETE FROM sessions WHERE user_id = $1',
      [userId]
    );
    
    return result.length;
  }

  async deleteExpired(): Promise<number> {
    const result = await query(
      'DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP'
    );
    
    return result.length;
  }

  async count(): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM sessions WHERE expires_at > CURRENT_TIMESTAMP'
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async generateToken(): Promise<string> {
    return uuidv4();
  }

  private mapRowToSession(row: any): Session {
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
    };
  }
}

export const sessionRepository = new SessionRepository();
