export const NOTIFICATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  actor_id TEXT,
  actor_name TEXT,
  project_name TEXT,
  task_title TEXT,
  data TEXT DEFAULT '{}',
  is_read INTEGER DEFAULT 0,
  read_at TEXT,
  action_url TEXT,
  icon TEXT,
  priority TEXT DEFAULT 'normal',
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
)`;

export const NOTIFICATIONS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)',
];

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  project_name: string | null;
  task_title: string | null;
  data: string;
  is_read: number;
  read_at: string | null;
  action_url: string | null;
  icon: string | null;
  priority: string;
  expires_at: string | null;
  created_at: string;
}

export function notificationRowToEntity(row: NotificationRow) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    data: {
      entityType: row.entity_type || undefined,
      entityId: row.entity_id || undefined,
      actorId: row.actor_id || undefined,
      actorName: row.actor_name || undefined,
      projectName: row.project_name || undefined,
      taskTitle: row.task_title || undefined,
      ...JSON.parse(row.data),
    },
    read: row.is_read === 1,
    readAt: row.read_at ? new Date(row.read_at) : undefined,
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    actionUrl: row.action_url || undefined,
    icon: row.icon || undefined,
    priority: row.priority,
  };
}

export function notificationEntityToRow(entity: Record<string, unknown>) {
  const data = entity.data as Record<string, unknown>;
  return {
    id: entity.id,
    user_id: entity.userId,
    type: entity.type,
    title: entity.title,
    message: entity.message,
    entity_type: data?.entityType || null,
    entity_id: data?.entityId || null,
    actor_id: data?.actorId || null,
    actor_name: data?.actorName || null,
    project_name: data?.projectName || null,
    task_title: data?.taskTitle || null,
    data: JSON.stringify(data || {}),
    is_read: entity.read ? 1 : 0,
    read_at: entity.readAt ? new Date(entity.readAt as string).toISOString() : null,
    action_url: entity.actionUrl || null,
    icon: entity.icon || null,
    priority: entity.priority || 'normal',
    expires_at: entity.expiresAt ? new Date(entity.expiresAt as string).toISOString() : null,
  };
}
