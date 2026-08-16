import { DatabaseConnection, QueryResult } from '../connection.js';
import { Result, Ok, Err, Logger } from '@atlas/shared';

export interface TriggerRecord {
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

export class TriggerRepository {
  private db: DatabaseConnection;
  private logger: Logger;

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.logger = new Logger({ context: 'TriggerRepository' });
  }

  async findById(id: string): Promise<Result<TriggerRecord | null>> {
    const result = await this.db.query<TriggerRecord>('SELECT * FROM triggers WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!result.ok) return result;
    if (result.value.rows.length === 0) return Ok(null);
    return Ok(result.value.rows[0]);
  }

  async findByUuid(uuid: string): Promise<Result<TriggerRecord | null>> {
    const result = await this.db.query<TriggerRecord>('SELECT * FROM triggers WHERE uuid = ?', [uuid]);
    if (!result.ok) return result;
    if (result.value.rows.length === 0) return Ok(null);
    return Ok(result.value.rows[0]);
  }

  async findAll(options: { page?: number; limit?: number; sort?: string; order?: string; search?: string } = {}): Promise<Result<{ data: TriggerRecord[]; total: number }>> {
    const { page = 1, limit = 20, sort = 'created_at', order = 'desc', search } = options;
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (search) { conditions.push('(name LIKE ? OR description LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const countResult = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM triggers' + where, params);
    if (!countResult.ok) return countResult;
    const total = countResult.value.rows[0]?.count ?? 0;
    const offset = (page - 1) * limit;
    const dataResult = await this.db.query<TriggerRecord>('SELECT * FROM triggers' + where + ' ORDER BY ' + sort + ' ' + order + ' LIMIT ? OFFSET ?', [...params, limit, offset]);
    if (!dataResult.ok) return dataResult;
    return Ok({ data: dataResult.value.rows, total });
  }

  async create(data: Partial<TriggerRecord>): Promise<Result<TriggerRecord>> {
    const id = Math.random().toString(36).substr(2, 9);
    const record: TriggerRecord = { id, uuid: id, name: data.name ?? '', status: data.status ?? 'active', createdAt: new Date(), updatedAt: new Date(), ...data };
    return Ok(record);
  }

  async update(id: string, data: Partial<TriggerRecord>): Promise<Result<TriggerRecord>> {
    const existing = await this.findById(id);
    if (!existing.ok) return existing;
    if (!existing.value) return Err(new Error('Trigger not found'));
    return Ok({ ...existing.value, ...data, updatedAt: new Date() });
  }

  async delete(id: string): Promise<Result<void>> {
    await this.db.query('UPDATE triggers SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), id]);
    return Ok(undefined);
  }

  async count(): Promise<Result<number>> {
    const result = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM triggers WHERE deleted_at IS NULL');
    if (!result.ok) return result;
    return Ok(result.value.rows[0]?.count ?? 0);
  }

  async exists(id: string): Promise<Result<boolean>> {
    const result = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM triggers WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!result.ok) return result;
    return Ok((result.value.rows[0]?.count ?? 0) > 0);
  }
}