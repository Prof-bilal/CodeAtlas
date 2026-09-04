export const AUDIT_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
)`;

export const AUDIT_LOGS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON audit_logs(resource_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)',
];

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: string;
  created_at: string;
}

export function auditLogRowToEntity(row: AuditLogRow) {
  return {
    id: row.id,
    userId: row.user_id || undefined,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id || undefined,
    oldValues: row.old_values ? JSON.parse(row.old_values) : undefined,
    newValues: row.new_values ? JSON.parse(row.new_values) : undefined,
    ipAddress: row.ip_address || undefined,
    userAgent: row.user_agent || undefined,
    metadata: JSON.parse(row.metadata),
    createdAt: new Date(row.created_at),
  };
}

export function auditLogEntityToRow(entity: Record<string, unknown>) {
  return {
    id: entity.id,
    user_id: entity.userId || null,
    action: entity.action,
    resource_type: entity.resourceType,
    resource_id: entity.resourceId || null,
    old_values: entity.oldValues ? JSON.stringify(entity.oldValues) : null,
    new_values: entity.newValues ? JSON.stringify(entity.newValues) : null,
    ip_address: entity.ipAddress || null,
    user_agent: entity.userAgent || null,
    metadata: JSON.stringify(entity.metadata || {}),
  };
}

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export function createAuditLog(entry: AuditLogEntry): Omit<AuditLogRow, 'id' | 'created_at'> {
  return {
    user_id: entry.userId || null,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId || null,
    old_values: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
    new_values: entry.newValues ? JSON.stringify(entry.newValues) : null,
    ip_address: entry.ipAddress || null,
    user_agent: entry.userAgent || null,
    metadata: JSON.stringify(entry.metadata || {}),
  };
}
