import { DatabaseConnection, QueryResult } from '../connection.js';
import { Result, Ok, Err, Logger } from '@atlas/shared';

export interface TaskRecord {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  [key: string]: unknown;
}

export class TaskRepository {
  private db: DatabaseConnection;
  private logger: Logger;

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.logger = new Logger({ context: 'TaskRepository' });
  }

  async findById(id: string): Promise<Result<TaskRecord | null>> {
    const result = await this.db.query<TaskRecord>('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!result.ok) return result;
    if (result.value.rows.length === 0) return Ok(null);
    return Ok(result.value.rows[0]);
  }

  async findByUuid(uuid: string): Promise<Result<TaskRecord | null>> {
    const result = await this.db.query<TaskRecord>('SELECT * FROM tasks WHERE uuid = ?', [uuid]);
    if (!result.ok) return result;
    if (result.value.rows.length === 0) return Ok(null);
    return Ok(result.value.rows[0]);
  }

  async findAll(options: { page?: number; limit?: number; sort?: string; order?: string; search?: string } = {}): Promise<Result<{ data: TaskRecord[]; total: number }>> {
    const { page = 1, limit = 20, sort = 'created_at', order = 'desc', search } = options;
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (search) { conditions.push('(name LIKE ? OR description LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const countResult = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM tasks' + where, params);
    if (!countResult.ok) return countResult;
    const total = countResult.value.rows[0]?.count ?? 0;
    const offset = (page - 1) * limit;
    const dataResult = await this.db.query<TaskRecord>('SELECT * FROM tasks' + where + ' ORDER BY ' + sort + ' ' + order + ' LIMIT ? OFFSET ?', [...params, limit, offset]);
    if (!dataResult.ok) return dataResult;
    return Ok({ data: dataResult.value.rows, total });
  }

  async create(data: Partial<TaskRecord>): Promise<Result<TaskRecord>> {
    const id = Math.random().toString(36).substr(2, 9);
    const record: TaskRecord = { id, uuid: id, name: data.name ?? '', status: data.status ?? 'active', createdAt: new Date(), updatedAt: new Date(), ...data };
    return Ok(record);
  }

  async update(id: string, data: Partial<TaskRecord>): Promise<Result<TaskRecord>> {
    const existing = await this.findById(id);
    if (!existing.ok) return existing;
    if (!existing.value) return Err(new Error('Task not found'));
    return Ok({ ...existing.value, ...data, updatedAt: new Date() });
  }

  async delete(id: string): Promise<Result<void>> {
    await this.db.query('UPDATE tasks SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), id]);
    return Ok(undefined);
  }

  async count(): Promise<Result<number>> {
    const result = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM tasks WHERE deleted_at IS NULL');
    if (!result.ok) return result;
    return Ok(result.value.rows[0]?.count ?? 0);
  }

  async exists(id: string): Promise<Result<boolean>> {
    const result = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM tasks WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!result.ok) return result;
    return Ok((result.value.rows[0]?.count ?? 0) > 0);
  }
}