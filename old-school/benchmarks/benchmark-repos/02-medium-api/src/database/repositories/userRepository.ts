import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../database/databaseService.js';
import { logger } from '../utils/logger.js';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
  role?: string;
  status?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  passwordHash?: string;
}

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const result = await databaseService.query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await databaseService.query<User>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const id = uuidv4();
    const result = await databaseService.query<User>(
      `INSERT INTO users (id, email, name, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, input.email, input.name, input.passwordHash, input.role || 'user', input.status || 'active']
    );
    return result.rows[0];
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(input.name);
    }
    if (input.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(input.email);
    }
    if (input.role !== undefined) {
      fields.push(`role = $${paramCount++}`);
      values.push(input.role);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(input.status);
    }
    if (input.passwordHash !== undefined) {
      fields.push(`password_hash = $${paramCount++}`);
      values.push(input.passwordHash);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await databaseService.query<User>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await databaseService.query(
      'DELETE FROM users WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findAll(options?: { limit?: number; offset?: number; status?: string }): Promise<User[]> {
    let query = 'SELECT * FROM users';
    const params: any[] = [];
    const conditions: string[] = [];

    if (options?.status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(options.status);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await databaseService.query<User>(query, params);
    return result.rows;
  }

  async count(): Promise<number> {
    const result = await databaseService.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM users'
    );
    return parseInt(result.rows[0].count);
  }

  async existsByEmail(email: string): Promise<boolean> {
    const result = await databaseService.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) as exists',
      [email]
    );
    return result.rows[0].exists;
  }
}

export const userRepository = new UserRepository();
