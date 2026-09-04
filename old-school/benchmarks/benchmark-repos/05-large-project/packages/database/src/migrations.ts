import { DatabaseConnection } from './connection.js';
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
}