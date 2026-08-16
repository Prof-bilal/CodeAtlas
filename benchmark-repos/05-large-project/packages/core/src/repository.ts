import { Result } from '@atlas/shared';
export interface Repository<T, TId> {
  findById(id: TId): Promise<Result<T | null>>;
  findAll(opts?: { page?: number; limit?: number; sort?: string; order?: string }): Promise<Result<T[]>>;
  save(entity: T): Promise<Result<T>>;
  delete(id: TId): Promise<Result<void>>;
  exists(id: TId): Promise<Result<boolean>>;
  count(filter?: Record<string, unknown>): Promise<Result<number>>;
}