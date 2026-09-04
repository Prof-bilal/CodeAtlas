// gen-database.js
const { ENTITIES, pick, write } = require('./gen-modules/utils');
const path = require('path');
const BASE = __dirname;
let count = 0;
const base = path.join(BASE, 'packages/database/src');

write(path.join(base, 'schema.ts'), `export interface TableDefinition { name: string; columns: ColumnDefinition[]; indexes: IndexDefinition[]; foreignKeys: ForeignKeyDefinition[]; }
export interface ColumnDefinition { name: string; type: string; nullable: boolean; primaryKey: boolean; defaultValue?: string; unique?: boolean; }
export interface IndexDefinition { name: string; columns: string[]; unique: boolean; type: 'btree' | 'hash' | 'gin' | 'gist'; }
export interface ForeignKeyDefinition { column: string; referencesTable: string; referencesColumn: string; onDelete: string; }
export const SCHEMA_VERSION = 42;
export const TABLES: TableDefinition[] = [
  { name: 'users', columns: [{ name: 'id', type: 'TEXT', nullable: false, primaryKey: true }, { name: 'email', type: 'TEXT', nullable: false, unique: true }, { name: 'first_name', type: 'TEXT', nullable: false }, { name: 'last_name', type: 'TEXT', nullable: false }, { name: 'status', type: 'TEXT', nullable: false }, { name: 'created_at', type: 'TEXT', nullable: false }, { name: 'updated_at', type: 'TEXT', nullable: false }, { name: 'deleted_at', type: 'TEXT', nullable: true }], indexes: [{ name: 'idx_users_email', columns: ['email'], unique: true, type: 'btree' }], foreignKeys: [] },
  { name: 'organizations', columns: [{ name: 'id', type: 'TEXT', nullable: false, primaryKey: true }, { name: 'name', type: 'TEXT', nullable: false }, { name: 'slug', type: 'TEXT', nullable: false, unique: true }, { name: 'owner_id', type: 'TEXT', nullable: false }, { name: 'created_at', type: 'TEXT', nullable: false }], indexes: [{ name: 'idx_orgs_slug', columns: ['slug'], unique: true, type: 'btree' }], foreignKeys: [{ column: 'owner_id', referencesTable: 'users', referencesColumn: 'id', onDelete: 'RESTRICT' }] },
  { name: 'projects', columns: [{ name: 'id', type: 'TEXT', nullable: false, primaryKey: true }, { name: 'name', type: 'TEXT', nullable: false }, { name: 'organization_id', type: 'TEXT', nullable: false }, { name: 'status', type: 'TEXT', nullable: false }, { name: 'created_at', type: 'TEXT', nullable: false }], indexes: [{ name: 'idx_projects_org', columns: ['organization_id'], unique: false, type: 'btree' }], foreignKeys: [{ column: 'organization_id', referencesTable: 'organizations', referencesColumn: 'id', onDelete: 'CASCADE' }] },
  { name: 'tasks', columns: [{ name: 'id', type: 'TEXT', nullable: false, primaryKey: true }, { name: 'title', type: 'TEXT', nullable: false }, { name: 'status', type: 'TEXT', nullable: false }, { name: 'project_id', type: 'TEXT', nullable: false }, { name: 'created_at', type: 'TEXT', nullable: false }], indexes: [{ name: 'idx_tasks_project', columns: ['project_id'], unique: false, type: 'btree' }], foreignKeys: [{ column: 'project_id', referencesTable: 'projects', referencesColumn: 'id', onDelete: 'CASCADE' }] },
];`);
count++;

write(path.join(base, 'connection.ts'), `import { Result, Ok, Err, Logger } from '@atlas/shared';
export interface DatabaseConfig { host: string; port: number; database: string; user: string; password: string; poolSize: number; }
export interface QueryResult<T = unknown> { rows: T[]; rowCount: number; command: string; duration: number; }
export class DatabaseConnection {
  private logger: Logger;
  private connected = false;
  constructor(private config: DatabaseConfig) { this.logger = new Logger({ context: 'DB' }); }
  async connect(): Promise<Result<void>> { this.connected = true; this.logger.info('Connected to ' + this.config.database); return Ok(undefined); }
  async disconnect(): Promise<Result<void>> { this.connected = false; return Ok(undefined); }
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<Result<QueryResult<T>>> {
    if (!this.connected) return Err(new Error('Not connected'));
    const start = Date.now();
    return Ok({ rows: [] as T[], rowCount: 0, command: sql.split(' ')[0].toUpperCase(), duration: Date.now() - start });
  }
  async transaction<T>(fn: (trx: any) => Promise<T>): Promise<Result<T>> { try { return Ok(await fn(null)); } catch (e) { return Err(e as Error); } }
  async healthCheck(): Promise<Result<{ connected: boolean; latency: number }>> { const s = Date.now(); return Ok({ connected: this.connected, latency: Date.now() - s }); }
}`);
count++;

write(path.join(base, 'migrations.ts'), `import { DatabaseConnection } from './connection.js';
import { SCHEMA_VERSION } from './schema.js';
import { Result, Ok, Err, Logger } from '@atlas/shared';
export interface Migration { version: number; name: string; up: string[]; down: string[]; }
export class MigrationRunner {
  private logger: Logger;
  private migrations: Migration[];
  constructor(private db: DatabaseConnection) {
    this.logger = new Logger({ context: 'Migrations' });
    this.migrations = this.createMigrations();
  }
  async getCurrentVersion(): Promise<number> {
    const r = await this.db.query<{ version: number }>('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
    if (!r.ok || r.value.rows.length === 0) return 0;
    return r.value.rows[0].version;
  }
  async runPending(): Promise<Result<number>> {
    try {
      const current = await this.getCurrentVersion();
      const pending = this.migrations.filter(m => m.version > current);
      this.logger.info('Running ' + pending.length + ' migrations');
      for (const m of pending) {
        for (const sql of m.up) { const r = await this.db.query(sql); if (!r.ok) return r; }
        await this.db.query('INSERT INTO schema_version VALUES (?, ?)', [m.version, m.name]);
      }
      return Ok(pending.length);
    } catch (e) { return Err(e as Error); }
  }
  private createMigrations(): Migration[] { return []; }
}`);
count++;

write(path.join(base, 'index.ts'), `export * from './schema.js';
export * from './connection.js';
export * from './migrations.js';`);
count++;

// Generate repository files
for (let i = 0; i < 196; i++) {
  const entity = ENTITIES[i % ENTITIES.length];
  const tableName = entity.toLowerCase() + 's';
  write(path.join(base, `repositories/${tableName}-repository-${i}.ts`), `import { DatabaseConnection, QueryResult } from '../connection.js';
import { Result, Ok, Err, Logger } from '@atlas/shared';

export interface ${entity}Record {
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

export class ${entity}Repository {
  private db: DatabaseConnection;
  private logger: Logger;

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.logger = new Logger({ context: '${entity}Repository' });
  }

  async findById(id: string): Promise<Result<${entity}Record | null>> {
    const result = await this.db.query<${entity}Record>('SELECT * FROM ${tableName} WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!result.ok) return result;
    if (result.value.rows.length === 0) return Ok(null);
    return Ok(result.value.rows[0]);
  }

  async findByUuid(uuid: string): Promise<Result<${entity}Record | null>> {
    const result = await this.db.query<${entity}Record>('SELECT * FROM ${tableName} WHERE uuid = ?', [uuid]);
    if (!result.ok) return result;
    if (result.value.rows.length === 0) return Ok(null);
    return Ok(result.value.rows[0]);
  }

  async findAll(options: { page?: number; limit?: number; sort?: string; order?: string; search?: string } = {}): Promise<Result<{ data: ${entity}Record[]; total: number }>> {
    const { page = 1, limit = 20, sort = 'created_at', order = 'desc', search } = options;
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (search) { conditions.push('(name LIKE ? OR description LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const countResult = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM ${tableName}' + where, params);
    if (!countResult.ok) return countResult;
    const total = countResult.value.rows[0]?.count ?? 0;
    const offset = (page - 1) * limit;
    const dataResult = await this.db.query<${entity}Record>('SELECT * FROM ${tableName}' + where + ' ORDER BY ' + sort + ' ' + order + ' LIMIT ? OFFSET ?', [...params, limit, offset]);
    if (!dataResult.ok) return dataResult;
    return Ok({ data: dataResult.value.rows, total });
  }

  async create(data: Partial<${entity}Record>): Promise<Result<${entity}Record>> {
    const id = Math.random().toString(36).substr(2, 9);
    const record: ${entity}Record = { id, uuid: id, name: data.name ?? '', status: data.status ?? 'active', createdAt: new Date(), updatedAt: new Date(), ...data };
    return Ok(record);
  }

  async update(id: string, data: Partial<${entity}Record>): Promise<Result<${entity}Record>> {
    const existing = await this.findById(id);
    if (!existing.ok) return existing;
    if (!existing.value) return Err(new Error('${entity} not found'));
    return Ok({ ...existing.value, ...data, updatedAt: new Date() });
  }

  async delete(id: string): Promise<Result<void>> {
    await this.db.query('UPDATE ${tableName} SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), id]);
    return Ok(undefined);
  }

  async count(): Promise<Result<number>> {
    const result = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM ${tableName} WHERE deleted_at IS NULL');
    if (!result.ok) return result;
    return Ok(result.value.rows[0]?.count ?? 0);
  }

  async exists(id: string): Promise<Result<boolean>> {
    const result = await this.db.query<{ count: number }>('SELECT COUNT(*) as count FROM ${tableName} WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!result.ok) return result;
    return Ok((result.value.rows[0]?.count ?? 0) > 0);
  }
}`);
  count++;
}

console.log('Database created: ' + count + ' files');
