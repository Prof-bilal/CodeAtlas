import { Result, Ok } from '@atlas/shared';
export interface Transaction { commit(): Promise<Result<void>>; rollback(): Promise<Result<void>>; isActive(): boolean; }
export interface UnitOfWork {
  begin(): Promise<Result<Transaction>>;
  getRepository<T>(name: string): T;
  registerNew<T>(e: T): void;
  registerDirty<T>(e: T): void;
  registerDeleted<T>(e: T): void;
  commit(): Promise<Result<void>>;
  rollback(): Promise<Result<void>>;
}
export class InMemoryUnitOfWork implements UnitOfWork {
  private repos = new Map<string, unknown>();
  async begin() { return Ok({ commit: async () => Ok(undefined), rollback: async () => Ok(undefined), isActive: () => true } as Transaction); }
  getRepository<T>(name: string): T { return this.repos.get(name) as T; }
  registerRepository<T>(name: string, repo: T) { this.repos.set(name, repo); }
  registerNew<T>(e: T) {}
  registerDirty<T>(e: T) {}
  registerDeleted<T>(e: T) {}
  async commit() { return Ok(undefined); }
  async rollback() { return Ok(undefined); }
}