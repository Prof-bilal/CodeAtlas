export const SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
)`;

export const SESSIONS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',
];

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: string;
  is_active: number;
  metadata: string;
  created_at: string;
  last_active_at: string;
}

export function sessionRowToEntity(row: SessionRow) {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    userAgent: row.user_agent || undefined,
    ipAddress: row.ip_address || undefined,
    expiresAt: new Date(row.expires_at),
    isActive: row.is_active === 1,
    metadata: JSON.parse(row.metadata),
    createdAt: new Date(row.created_at),
    lastActiveAt: new Date(row.last_active_at),
  };
}

export function sessionEntityToRow(entity: Record<string, unknown>) {
  return {
    id: entity.id,
    user_id: entity.userId,
    token_hash: entity.tokenHash,
    user_agent: entity.userAgent || null,
    ip_address: entity.ipAddress || null,
    expires_at: new Date(entity.expiresAt as string).toISOString(),
    is_active: entity.isActive ? 1 : 0,
    metadata: JSON.stringify(entity.metadata || {}),
    last_active_at: new Date(entity.lastActiveAt as string).toISOString(),
  };
}
