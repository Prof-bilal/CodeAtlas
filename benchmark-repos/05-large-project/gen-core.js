// gen-core.js
const { ENTITIES, pick, write } = require('./gen-modules/utils');
const path = require('path');
const BASE = __dirname;
let count = 0;
const coreBase = path.join(BASE, 'packages/core/src');

write(path.join(coreBase, 'entity.ts'), `export abstract class Entity<TId> {
  protected _id: TId;
  protected _createdAt: Date;
  protected _updatedAt: Date;
  protected _deletedAt?: Date;
  constructor(id: TId) { this._id = id; this._createdAt = new Date(); this._updatedAt = new Date(); }
  get id(): TId { return this._id; }
  touch(): void { this._updatedAt = new Date(); }
  softDelete(): void { this._deletedAt = new Date(); this.touch(); }
  abstract toJSON(): Record<string, unknown>;
  equals(other: Entity<TId>): boolean { return other !== null && this._id === other._id; }
}`);
count++;

write(path.join(coreBase, 'aggregate-root.ts'), `import { Entity } from './entity.js';
import { DomainEvent } from '@atlas/shared';
export abstract class AggregateRoot<TId> extends Entity<TId> {
  private _domainEvents: DomainEvent[] = [];
  private _version = 0;
  get version(): number { return this._version; }
  protected addDomainEvent(event: DomainEvent): void { this._domainEvents.push(event); }
  clearEvents(): void { this._domainEvents = []; }
  abstract _applyEvent(event: DomainEvent): void;
  pullDomainEvents(): DomainEvent[] { const e = [...this._domainEvents]; this._domainEvents = []; return e; }
}`);
count++;

write(path.join(coreBase, 'value-object.ts'), `export abstract class ValueObject<T> {
  protected readonly _value: T;
  protected constructor(value: T) { this._value = Object.freeze(value); }
  get value(): T { return this._value; }
  abstract equals(other: ValueObject<T>): boolean;
}`);
count++;

write(path.join(coreBase, 'repository.ts'), `import { Result } from '@atlas/shared';
export interface Repository<T, TId> {
  findById(id: TId): Promise<Result<T | null>>;
  findAll(opts?: { page?: number; limit?: number; sort?: string; order?: string }): Promise<Result<T[]>>;
  save(entity: T): Promise<Result<T>>;
  delete(id: TId): Promise<Result<void>>;
  exists(id: TId): Promise<Result<boolean>>;
  count(filter?: Record<string, unknown>): Promise<Result<number>>;
}`);
count++;

write(path.join(coreBase, 'service.ts'), `import { Logger } from '@atlas/shared';
export abstract class BaseService {
  protected logger: Logger;
  constructor(context: string) { this.logger = new Logger({ context }); }
  protected async execute<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try { const r = await fn(); this.logger.debug('Done ' + operation, { duration: Date.now() - start }); return r; }
    catch (e) { this.logger.error('Failed ' + operation, e as Error); throw e; }
  }
}`);
count++;

write(path.join(coreBase, 'ports.ts'), `import { Result } from '@atlas/shared';
export interface AuthPort { hashPassword(pw: string): Promise<Result<{ hash: string; salt: string }>>; verifyPassword(pw: string, hash: string, salt: string): Promise<Result<boolean>>; generateToken(payload: Record<string, unknown>): Promise<Result<string>>; }
export interface StoragePort { upload(key: string, data: Buffer, ct: string): Promise<Result<string>>; download(key: string): Promise<Result<Buffer>>; delete(key: string): Promise<Result<void>>; }
export interface EmailPort { send(to: string | string[], subject: string, html: string): Promise<Result<void>>; }
export interface PaymentPort { createPaymentIntent(amount: number, currency: string): Promise<Result<{ id: string; clientSecret: string }>>; confirmPayment(id: string): Promise<Result<{ status: string }>>; }
export interface SearchPort { index(idx: string, id: string, doc: Record<string, unknown>): Promise<Result<void>>; search(idx: string, query: string): Promise<Result<unknown[]>>; }
export interface CachePort { get<T>(key: string): Promise<Result<T | null>>; set<T>(key: string, value: T, ttl?: number): Promise<Result<void>>; delete(key: string): Promise<Result<void>>; }
export interface QueuePort { enqueue(type: string, payload: unknown): Promise<Result<string>>; process(type: string, handler: (p: unknown) => Promise<void>): Promise<Result<void>>; }`);
count++;

write(path.join(coreBase, 'unit-of-work.ts'), `import { Result, Ok } from '@atlas/shared';
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
}`);
count++;

write(path.join(coreBase, 'domain-event-handler.ts'), `import { DomainEvent } from '@atlas/shared';
export interface IDomainEventHandler<T = unknown> {
  handle(event: DomainEvent<T>): Promise<void>;
  canHandle(event: DomainEvent): boolean;
}
export class DomainEventDispatcher {
  private handlers = new Map<string, IDomainEventHandler[]>();
  register<T>(type: string, handler: IDomainEventHandler<T>): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler as IDomainEventHandler);
  }
  async dispatch(event: DomainEvent): Promise<void> {
    const h = this.handlers.get(event.eventType) ?? [];
    await Promise.all(h.filter(hh => hh.canHandle(event)).map(hh => hh.handle(event)));
  }
}`);
count++;

write(path.join(coreBase, 'index.ts'), `export * from './entity.js';
export * from './aggregate-root.js';
export * from './value-object.js';
export * from './repository.js';
export * from './unit-of-work.js';
export * from './service.js';
export * from './ports.js';
export * from './domain-event-handler.js';`);
count++;

// Generate 270 core utility files
for (let i = 0; i < 270; i++) {
  const type = pick(['middleware','interceptor','plugin','handler','filter','decorator','adapter','facade','proxy','helper','processor','transformer','validator','serializer','wrapper']);
  const domain = pick(ENTITIES);
  const el = domain.toLowerCase();
  const tc = type.charAt(0).toUpperCase() + type.slice(1);
  write(path.join(coreBase, `core/${type}-${el}-${i}.ts`), `import { Result, Ok, Err, Logger } from '@atlas/shared';

export interface Config${i} {
  enabled: boolean;
  priority: number;
  timeout: number;
  retries: number;
  cacheResults: boolean;
  cacheTTL: number;
  metadata: Record<string, unknown>;
}

export interface Context${i} {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

export class ${domain}${tc}${i} {
  private config: Config${i};
  private logger: Logger;
  private cache = new Map<string, { value: unknown; expiresAt: number }>();
  private hooks = new Map<string, Array<(...args: unknown[]) => Promise<unknown>>>();

  constructor(config?: Partial<Config${i}>) {
    this.config = { enabled: true, priority: 0, timeout: 30000, retries: 3, cacheResults: true, cacheTTL: 300000, metadata: {}, ...config };
    this.logger = new Logger({ context: '${domain}${tc}${i}' });
  }

  async execute(ctx: Context${i}, fn: () => Promise<unknown>): Promise<Result<unknown>> {
    if (!this.config.enabled) return Ok(undefined);
    const start = Date.now();
    try {
      this.logger.debug('Executing');
      await this.runHooks('before', ctx);
      const result = await Promise.race([fn(), this.timeoutPromise()]);
      await this.runHooks('after', ctx);
      this.logger.debug('Completed', { duration: Date.now() - start });
      return Ok(result);
    } catch (error) {
      this.logger.error('Failed', error as Error);
      await this.runHooks('error', ctx, error);
      return Err(error as Error);
    }
  }

  async executeWithRetry(ctx: Context${i}, fn: () => Promise<unknown>): Promise<Result<unknown>> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      const result = await this.execute(ctx, fn);
      if (result.ok) return result;
      lastErr = result.error as Error;
      if (attempt < this.config.retries) {
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 30000)));
      }
    }
    return Err(lastErr!);
  }

  getCached(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.cache.delete(key); return undefined; }
    return entry.value;
  }

  setCache(key: string, value: unknown): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.config.cacheTTL });
  }

  private async runHooks(phase: string, ctx: Context${i}, error?: unknown): Promise<void> {
    for (const hook of (this.hooks.get(phase) ?? [])) {
      try { await hook(ctx, error); } catch {}
    }
  }

  private timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.config.timeout));
  }

  on(phase: string, hook: (...args: unknown[]) => Promise<unknown>): () => void {
    if (!this.hooks.has(phase)) this.hooks.set(phase, []);
    this.hooks.get(phase)!.push(hook);
    return () => { const h = this.hooks.get(phase)!; const idx = h.indexOf(hook); if (idx >= 0) h.splice(idx, 1); };
  }

  getConfig(): Config${i} { return { ...this.config }; }
  setEnabled(enabled: boolean): void { this.config.enabled = enabled; }
}`);
  count++;
}

console.log('Core created: ' + count + ' files');
