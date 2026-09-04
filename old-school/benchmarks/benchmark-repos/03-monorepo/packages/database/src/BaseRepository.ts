export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface CountOptions {
  where?: Record<string, unknown>;
}

export abstract class BaseRepository<T extends BaseEntity> {
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  abstract findById(id: string): Promise<T | null>;
  abstract findMany(options?: FindOptions): Promise<T[]>;
  abstract create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  abstract update(id: string, data: Partial<T>): Promise<T | null>;
  abstract delete(id: string): Promise<boolean>;
  abstract count(options?: CountOptions): Promise<number>;

  async exists(id: string): Promise<boolean> {
    const entity = await this.findById(id);
    return entity !== null;
  }

  async findByIdOrThrow(id: string): Promise<T> {
    const entity = await this.findById(id);
    if (!entity) {
      throw new Error(`${this.tableName} with id ${id} not found`);
    }
    return entity;
  }

  async createMany(data: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T[]> {
    const results: T[] = [];
    for (const item of data) {
      results.push(await this.create(item));
    }
    return results;
  }

  async updateMany(ids: string[], data: Partial<T>): Promise<T[]> {
    const results: T[] = [];
    for (const id of ids) {
      const updated = await this.update(id, data);
      if (updated) results.push(updated);
    }
    return results;
  }

  async deleteMany(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (await this.delete(id)) count++;
    }
    return count;
  }

  protected generateId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
  }

  protected sanitizeForDb(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Date) {
        sanitized[key] = value.toISOString();
      } else if (value !== undefined) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  protected mapFromDb(row: Record<string, unknown>): T {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        result[key] = new Date(value);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }
}
