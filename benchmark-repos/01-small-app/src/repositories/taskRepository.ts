import { query, queryOne } from '../config/database.js';
import { TaskModel, CreateTaskInput, UpdateTaskInput, TaskFilters } from '../models/task.js';

export class TaskRepository {
  async findById(id: string): Promise<TaskModel | null> {
    const row = await queryOne<any>(
      'SELECT * FROM tasks WHERE id = $1',
      [id]
    );
    
    if (!row) return null;
    
    return this.mapRowToTask(row);
  }

  async create(input: CreateTaskInput, userId: string): Promise<TaskModel> {
    const row = await queryOne<any>(
      `INSERT INTO tasks (title, description, status, priority, due_date, user_id, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.title,
        input.description || null,
        input.status || 'pending',
        input.priority || 'medium',
        input.dueDate ? new Date(input.dueDate) : null,
        userId,
        input.assignedTo || null,
      ]
    );
    
    return this.mapRowToTask(row!);
  }

  async update(id: string, input: UpdateTaskInput): Promise<TaskModel | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }

    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }

    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (input.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(input.priority);
    }

    if (input.dueDate !== undefined) {
      updates.push(`due_date = $${paramIndex++}`);
      values.push(input.dueDate ? new Date(input.dueDate) : null);
    }

    if (input.assignedTo !== undefined) {
      updates.push(`assigned_to = $${paramIndex++}`);
      values.push(input.assignedTo);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const row = await queryOne<any>(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return row ? this.mapRowToTask(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM tasks WHERE id = $1',
      [id]
    );
    
    return result.length > 0;
  }

  async findByUser(userId: string, filters: TaskFilters = {}, limit: number = 50, offset: number = 0): Promise<TaskModel[]> {
    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [userId];
    let paramIndex = 2;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters.priority) {
      conditions.push(`priority = $${paramIndex++}`);
      values.push(filters.priority);
    }

    if (filters.assignedTo) {
      conditions.push(`assigned_to = $${paramIndex++}`);
      values.push(filters.assignedTo);
    }

    if (filters.search) {
      conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query<any>(
      `SELECT * FROM tasks ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, limit, offset]
    );

    return rows.map(this.mapRowToTask);
  }

  async countByUser(userId: string, filters: TaskFilters = {}): Promise<number> {
    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [userId];
    let paramIndex = 2;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters.priority) {
      conditions.push(`priority = $${paramIndex++}`);
      values.push(filters.priority);
    }

    if (filters.assignedTo) {
      conditions.push(`assigned_to = $${paramIndex++}`);
      values.push(filters.assignedTo);
    }

    if (filters.search) {
      conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks ${whereClause}`,
      values
    );

    return parseInt(result?.count || '0', 10);
  }

  async findByAssignedTo(userId: string, limit: number = 50, offset: number = 0): Promise<TaskModel[]> {
    const rows = await query<any>(
      'SELECT * FROM tasks WHERE assigned_to = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );

    return rows.map(this.mapRowToTask);
  }

  async findOverdueTasks(): Promise<TaskModel[]> {
    const rows = await query<any>(
      `SELECT * FROM tasks 
       WHERE due_date < CURRENT_TIMESTAMP 
       AND status NOT IN ('completed', 'cancelled')
       ORDER BY due_date ASC`
    );

    return rows.map(this.mapRowToTask);
  }

  async getTaskStats(userId: string): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  }> {
    const result = await queryOne<any>(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'in_progress') as "inProgress",
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
       FROM tasks WHERE user_id = $1`,
      [userId]
    );

    return {
      total: parseInt(result?.total || '0', 10),
      pending: parseInt(result?.pending || '0', 10),
      inProgress: parseInt(result?.inProgress || '0', 10),
      completed: parseInt(result?.completed || '0', 10),
      cancelled: parseInt(result?.cancelled || '0', 10),
    };
  }

  private mapRowToTask(row: any): TaskModel {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueDate: row.due_date ? new Date(row.due_date) : null,
      userId: row.user_id,
      assignedTo: row.assigned_to,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const taskRepository = new TaskRepository();
