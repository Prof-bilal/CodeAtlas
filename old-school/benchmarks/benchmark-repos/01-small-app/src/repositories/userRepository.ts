import { query, queryOne } from '../config/database.js';
import { UserModel, CreateUserInput, UpdateUserInput } from '../models/user.js';
import bcrypt from 'bcryptjs';
import { authConfig } from '../config/auth.js';

export class UserRepository {
  async findById(id: string): Promise<UserModel | null> {
    const row = await queryOne<any>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    
    if (!row) return null;
    
    return this.mapRowToUser(row);
  }

  async findByEmail(email: string): Promise<UserModel | null> {
    const row = await queryOne<any>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (!row) return null;
    
    return this.mapRowToUser(row);
  }

  async create(input: CreateUserInput): Promise<UserModel> {
    const passwordHash = await bcrypt.hash(input.password, authConfig.bcryptSaltRounds);
    
    const row = await queryOne<any>(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.email.toLowerCase(), passwordHash, input.firstName, input.lastName]
    );
    
    return this.mapRowToUser(row!);
  }

  async update(id: string, input: UpdateUserInput): Promise<UserModel | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.firstName !== undefined) {
      updates.push(`first_name = $${paramIndex++}`);
      values.push(input.firstName);
    }

    if (input.lastName !== undefined) {
      updates.push(`last_name = $${paramIndex++}`);
      values.push(input.lastName);
    }

    if (input.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(input.email.toLowerCase());
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const row = await queryOne<any>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return row ? this.mapRowToUser(row) : null;
  }

  async updatePassword(id: string, newPassword: string): Promise<boolean> {
    const passwordHash = await bcrypt.hash(newPassword, authConfig.bcryptSaltRounds);
    
    const result = await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, id]
    );
    
    return result.length > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM users WHERE id = $1',
      [id]
    );
    
    return result.length > 0;
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<UserModel[]> {
    const rows = await query<any>(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    
    return rows.map(this.mapRowToUser);
  }

  async count(): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM users'
    );
    
    return parseInt(result?.count || '0', 10);
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    let sql = 'SELECT 1 FROM users WHERE email = $1';
    const params: any[] = [email.toLowerCase()];
    
    if (excludeId) {
      sql += ' AND id != $2';
      params.push(excludeId);
    }
    
    const result = await queryOne(sql, params);
    return result !== null;
  }

  private mapRowToUser(row: any): UserModel {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const userRepository = new UserRepository();
