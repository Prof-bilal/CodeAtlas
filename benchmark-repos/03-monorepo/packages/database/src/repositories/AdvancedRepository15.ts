export interface RepositoryConfig15 {
  tableName: string;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  cacheMaxSize: number;
  softDelete: boolean;
  timestamps: boolean;
  validationEnabled: boolean;
  paginationDefault: number;
}
export interface FindOptions15 {
  where?: Record<string, unknown>;
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
  select?: string[];
  include?: string[];
}
export interface PaginationResult15 {
  items: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
export interface Entity15 {
  id: string;
  name: string;
  description: string;
  status: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  version: number;
}
export interface CreateEntity15Input {
  name: string;
  description?: string;
  status?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}
export interface UpdateEntity15Input {
  name?: string;
  description?: string;
  status?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}
export class Repository15 {
  private config: RepositoryConfig15;
  private entities: Map<string, Entity15> = new Map();
  private cache: Map<string, { data: unknown; expiresAt: Date }> = new Map();
  private queryCount = 0;
  private operationLog: Array<{ operation: string; timestamp: Date; duration: number }> = [];
  constructor(config: RepositoryConfig15) { this.config = config; }
  async findById(id: string): Promise<Entity15 | null> {
    this.queryCount++;
    if (this.config.cacheEnabled) { const c = this.cache.get('find:' + id); if (c && c.expiresAt > new Date()) return c.data as Entity15; }
    const entity = this.entities.get(id);
    if (!entity) return null;
    if (entity.status === 'archived' && this.config.softDelete) return null;
    if (this.config.cacheEnabled) this.cache.set('find:' + id, { data: entity, expiresAt: new Date(Date.now() + this.config.cacheTtlMs) });
    return entity;
  }
  async findMany(options: FindOptions15 = {}): Promise<PaginationResult15> {
    this.queryCount++;
    let items = Array.from(this.entities.values());
    if (this.config.softDelete) items = items.filter(e => e.status !== 'archived');
    if (options.where) { for (const [key, val] of Object.entries(options.where)) items = items.filter(item => (item as Record<string, unknown>)[key] === val); }
    if (options.orderBy) items.sort((a, b) => { for (const { field, direction } of options.orderBy!) { const cmp = String((a as Record<string, unknown>)[field]).localeCompare(String((b as Record<string, unknown>)[field])); if (cmp !== 0) return direction === 'asc' ? cmp : -cmp; } return 0; });
    const total = items.length; const page = options.offset ? Math.floor(options.offset / (options.limit || this.config.paginationDefault)) + 1 : 1; const pageSize = options.limit || this.config.paginationDefault;
    items = items.slice(options.offset || 0, (options.offset || 0) + pageSize);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize), hasNext: page < Math.ceil(total / pageSize), hasPrevious: page > 1 };
  }
  async create(input: CreateEntity15Input): Promise<Entity15> {
    this.queryCount++;
    const now = new Date();
    const entity: Entity15 = { id: crypto.randomUUID(), name: input.name, description: input.description || '', status: input.status || 'active', tags: input.tags || [], metadata: input.metadata || {}, createdAt: now, updatedAt: now, version: 1 };
    this.entities.set(entity.id, entity);
    return entity;
  }
  async update(id: string, input: UpdateEntity15Input): Promise<Entity15 | null> {
    this.queryCount++;
    const entity = this.entities.get(id);
    if (!entity) return null;
    const updated: Entity15 = { ...entity, ...input, updatedAt: new Date(), version: entity.version + 1 };
    this.entities.set(id, updated);
    this.cache.delete('find:' + id);
    return updated;
  }
  async delete(id: string): Promise<boolean> {
    this.queryCount++;
    const entity = this.entities.get(id);
    if (!entity) return false;
    if (this.config.softDelete) { entity.status = 'archived'; entity.deletedAt = new Date(); entity.version++; } else { this.entities.delete(id); }
    this.cache.delete('find:' + id);
    return true;
  }
  async count(where?: Record<string, unknown>): Promise<number> {
    this.queryCount++;
    let items = Array.from(this.entities.values());
    if (where) { for (const [key, val] of Object.entries(where)) items = items.filter(item => (item as Record<string, unknown>)[key] === val); }
    return items.length;
  }
  async exists(id: string): Promise<boolean> { const e = this.entities.get(id); return !!e && e.status !== 'archived'; }
  clearCache(): void { this.cache.clear(); }
  getStats(): { entityCount: number; queryCount: number; cacheSize: number } { return { entityCount: this.entities.size, queryCount: this.queryCount, cacheSize: this.cache.size }; }
  destroy(): void { this.entities.clear(); this.cache.clear(); this.operationLog = []; }
}
export function createRepository15(config: RepositoryConfig15): Repository15 { return new Repository15(config); }