import { Result, Ok, Err, Logger } from '@atlas/shared';
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
}