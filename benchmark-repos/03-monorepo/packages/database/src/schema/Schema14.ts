export interface Schema14Config {
  database: string;
  schemaVersion: number;
  enableMigrations: boolean;
  enableRollback: boolean;
  enableAuditLog: boolean;
  enableVersioning: boolean;
  enableSoftDelete: boolean;
  enableCaching: boolean;
  cacheTtlMs: number;
  maxConnections: number;
  connectionTimeoutMs: number;
  queryTimeoutMs: number;
}
export interface TableConfig14 {
  name: string;
  schema: string;
  primaryKey: string;
  foreignKeys: Array<{ column: string; references: string; onDelete: string }>;
  indexes: Array<{ columns: string[]; unique: boolean; name: string }>;
  constraints: Array<{ name: string; type: string; definition: string }>;
  timestamps: boolean;
  softDelete: boolean;
  versioning: boolean;
}
export interface ColumnConfig14 {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: unknown;
  maxLength?: number;
  precision?: number;
  scale?: number;
  isUnique: boolean;
  isIndexed: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: string;
  validation?: { required: boolean; minLength?: number; maxLength?: number; pattern?: string; min?: number; max?: number };
}
export interface Migration14 {
  version: number;
  name: string;
  up: string[];
  down: string[];
  checksum: string;
  executedAt?: Date;
  executionTimeMs?: number;
}
export interface AuditEntry14 {
  id: string;
  table: string;
  recordId: string;
  action: string;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  changedBy: string;
  changedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
}
export interface EntityVersion14 {
  id: string;
  entityId: string;
  version: number;
  data: Record<string, unknown>;
  createdAt: Date;
  createdBy: string;
  changeReason?: string;
}
export class Schema14Manager {
  private config: Schema14Config;
  private tables: Map<string, TableConfig14> = new Map();
  private migrations: Migration14[] = [];
  private auditLog: AuditEntry14[] = [];
  private versions: Map<string, EntityVersion14[]> = new Map();
  private queryLog: Array<{ query: string; duration: number; timestamp: Date; success: boolean }> = [];
  constructor(config: Schema14Config) { this.config = config; }
  registerTable(config: TableConfig14): void {
    this.tables.set(config.name, config);
    if (this.config.enableAuditLog) this.logAudit('SCHEMA_CHANGE', config.name, {}, { registered: true }, 'system');
  }
  addMigration(migration: Migration14): void { this.migrations.push(migration); this.migrations.sort(function(a, b) { return a.version - b.version; }); }
  async runMigrations(): Promise<{ applied: number; skipped: number; errors: string[] }> {
    var errors: string[] = [];
    var applied = 0;
    var skipped = 0;
    for (var migration of this.migrations) {
      if (migration.executedAt) { skipped++; continue; }
      try {
        var start = Date.now();
        for (var sql of migration.up) this.logQuery(sql, Date.now() - start, true);
        migration.executedAt = new Date();
        migration.executionTimeMs = Date.now() - start;
        applied++;
      } catch (error) {
        errors.push('Migration ' + migration.version + ' failed: ' + (error instanceof Error ? error.message : 'Unknown'));
        if (!this.config.enableRollback) break;
      }
    }
    return { applied: applied, skipped: skipped, errors: errors };
  }
  async rollbackMigration(version: number): Promise<{ rolledBack: boolean; error?: string }> {
    var migration = this.migrations.find(function(m) { return m.version === version; });
    if (!migration) return { rolledBack: false, error: 'Migration not found' };
    if (!migration.executedAt) return { rolledBack: false, error: 'Migration not executed' };
    try {
      var start = Date.now();
      for (var sql of migration.down) this.logQuery(sql, Date.now() - start, true);
      migration.executedAt = undefined;
      migration.executionTimeMs = undefined;
      return { rolledBack: true };
    } catch (error) { return { rolledBack: false, error: error instanceof Error ? error.message : 'Unknown' }; }
  }
  async logAudit(table: string, recordId: string, oldValues: Record<string, unknown>, newValues: Record<string, unknown>, changedBy: string): Promise<void> {
    if (!this.config.enableAuditLog) return;
    var entry: AuditEntry14 = { id: crypto.randomUUID(), table: table, recordId: recordId, action: Object.keys(oldValues).length === 0 ? 'INSERT' : 'UPDATE', oldValues: oldValues, newValues: newValues, changedBy: changedBy, changedAt: new Date(), metadata: {} };
    this.auditLog.push(entry);
    if (this.auditLog.length > 10000) this.auditLog = this.auditLog.slice(-5000);
  }
  async versionEntity(entityId: string, data: Record<string, unknown>, createdBy: string, reason?: string): Promise<void> {
    if (!this.config.enableVersioning) return;
    var versions = this.versions.get(entityId) || [];
    var version: EntityVersion14 = { id: crypto.randomUUID(), entityId: entityId, version: versions.length + 1, data: Object.assign({}, data), createdAt: new Date(), createdBy: createdBy, changeReason: reason };
    versions.push(version);
    this.versions.set(entityId, versions);
  }
  getEntityVersions(entityId: string): EntityVersion14[] { return this.versions.get(entityId) || []; }
  getAuditLog(options: { table?: string; recordId?: string; changedBy?: string; limit?: number } = {}): AuditEntry14[] {
    var entries = this.auditLog.slice();
    if (options.table) entries = entries.filter(function(e) { return e.table === options.table; });
    if (options.recordId) entries = entries.filter(function(e) { return e.recordId === options.recordId; });
    if (options.changedBy) entries = entries.filter(function(e) { return e.changedBy === options.changedBy; });
    return entries.slice(0, options.limit || 100);
  }
  getTableConfig(name: string): TableConfig14 | undefined { return this.tables.get(name); }
  getTableNames(): string[] { return Array.from(this.tables.keys()); }
  getMigrationStatus(): Array<{ version: number; name: string; executed: boolean; executionTimeMs?: number }> {
    return this.migrations.map(function(m) { return { version: m.version, name: m.name, executed: !!m.executedAt, executionTimeMs: m.executionTimeMs }; });
  }
  private logQuery(query: string, duration: number, success: boolean): void {
    this.queryLog.push({ query: query, duration: duration, timestamp: new Date(), success: success });
    if (this.queryLog.length > 10000) this.queryLog = this.queryLog.slice(-5000);
  }
  getStats(): { tableCount: number; migrationCount: number; auditLogSize: number; versionedEntities: number; queryLogSize: number } {
    return { tableCount: this.tables.size, migrationCount: this.migrations.length, auditLogSize: this.auditLog.length, versionedEntities: this.versions.size, queryLogSize: this.queryLog.length };
  }
  destroy(): void { this.tables.clear(); this.migrations = []; this.auditLog = []; this.versions.clear(); this.queryLog = []; }
}
export function createSchema14Manager(config: Schema14Config): Schema14Manager { return new Schema14Manager(config); }