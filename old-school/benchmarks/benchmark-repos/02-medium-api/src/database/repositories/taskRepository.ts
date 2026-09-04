import { v4 as uuidv4 } from 'uuid';
import { databaseService } from '../database/databaseService.js';
import { logger } from '../utils/logger.js';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: number;
  userId: string;
  assignedTo?: string;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: string;
  priority?: number;
  userId: string;
  assignedTo?: string;
  dueDate?: Date;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  assignedTo?: string;
  dueDate?: Date;
}

export class TaskRepository {
  async findById(id: string): Promise<Task | null> {
    const result = await databaseService.query<Task>(
      'SELECT * FROM tasks WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const id = uuidv4();
    const result = await databaseService.query<Task>(
      `INSERT INTO tasks (id, title, description, status, priority, user_id, assigned_to, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, input.title, input.description, input.status || 'pending', input.priority || 0, input.userId, input.assignedTo, input.dueDate]
    );
    return result.rows[0];
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(input.title);
    }
    if (input.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(input.description);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(input.status);
    }
    if (input.priority !== undefined) {
      fields.push(`priority = $${paramCount++}`);
      values.push(input.priority);
    }
    if (input.assignedTo !== undefined) {
      fields.push(`assigned_to = $${paramCount++}`);
      values.push(input.assignedTo);
    }
    if (input.dueDate !== undefined) {
      fields.push(`due_date = $${paramCount++}`);
      values.push(input.dueDate);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await databaseService.query<Task>(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await databaseService.query(
      'DELETE FROM tasks WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findByUserId(userId: string, options?: { status?: string; limit?: number; offset?: number }): Promise<Task[]> {
    let query = 'SELECT * FROM tasks WHERE user_id = $1';
    const params: any[] = [userId];

    if (options?.status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(options.status);
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

    const result = await databaseService.query<Task>(query, params);
    return result.rows;
  }

  async findByAssignedTo(userId: string): Promise<Task[]> {
    const result = await databaseService.query<Task>(
      'SELECT * FROM tasks WHERE assigned_to = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async count(userId?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM tasks';
    const params: any[] = [];

    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }

    const result = await databaseService.query<{ count: string }>(query, params);
    return parseInt(result.rows[0].count);
  }

  async findOverdue(): Promise<Task[]> {
    const result = await databaseService.query<Task>(
      `SELECT * FROM tasks 
       WHERE due_date < CURRENT_TIMESTAMP 
       AND status != 'completed'
       ORDER BY due_date ASC`
    );
    return result.rows;
  }
}

export const taskRepository = new TaskRepository();
