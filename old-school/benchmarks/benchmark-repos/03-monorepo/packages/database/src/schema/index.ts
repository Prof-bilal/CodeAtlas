export * from './users.js';
export * from './tasks.js';
export * from './projects.js';
export * from './payments.js';
export * from './notifications.js';
export * from './sessions.js';
export * from './auditLogs.js';

export const ALL_TABLES = [
  'users',
  'tasks',
  'projects',
  'payments',
  'notifications',
  'sessions',
  'audit_logs',
];

export const SCHEMA_VERSION = 1;

export const SCHEMA_METADATA_TABLE = `
CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export function getSchemaVersionSql(): string {
  return `SELECT value FROM schema_metadata WHERE key = 'schema_version'`;
}

export function setSchemaVersionSql(version: number): string {
  return `INSERT OR REPLACE INTO schema_metadata (key, value, updated_at) VALUES ('schema_version', '${version}', datetime('now'))`;
}
