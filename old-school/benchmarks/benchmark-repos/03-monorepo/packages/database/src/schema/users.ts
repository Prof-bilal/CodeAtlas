export const USERS_TABLE = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  locale TEXT DEFAULT 'en-US',
  theme TEXT DEFAULT 'system',
  email_notifications INTEGER DEFAULT 1,
  push_notifications INTEGER DEFAULT 1,
  sms_notifications INTEGER DEFAULT 0,
  notification_frequency TEXT DEFAULT 'instant',
  dashboard_layout TEXT DEFAULT 'grid',
  dashboard_default_view TEXT DEFAULT 'tasks',
  dashboard_widgets TEXT DEFAULT '["tasks","projects"]',
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export const USERS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
  'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
  'CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)',
  'CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)',
];

export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: string;
  status: string;
  password_hash: string;
  password_salt: string;
  timezone: string;
  locale: string;
  theme: string;
  email_notifications: number;
  push_notifications: number;
  sms_notifications: number;
  notification_frequency: string;
  dashboard_layout: string;
  dashboard_default_view: string;
  dashboard_widgets: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export function userRowToEntity(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar || undefined,
    role: row.role,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
    metadata: {
      timezone: row.timezone,
      locale: row.locale,
      preferences: {
        theme: row.theme as 'light' | 'dark' | 'system',
        notifications: {
          email: row.email_notifications === 1,
          push: row.push_notifications === 1,
          sms: row.sms_notifications === 1,
          frequency: row.notification_frequency as 'instant' | 'daily' | 'weekly',
        },
        dashboard: {
          layout: row.dashboard_layout as 'grid' | 'list',
          defaultView: row.dashboard_default_view,
          widgets: JSON.parse(row.dashboard_widgets),
        },
      },
    },
  };
}

export function userEntityToRow(entity: Record<string, unknown>) {
  const metadata = entity.metadata as Record<string, unknown>;
  const preferences = metadata?.preferences as Record<string, unknown>;
  const notifications = preferences?.notifications as Record<string, unknown>;
  const dashboard = preferences?.dashboard as Record<string, unknown>;
  return {
    id: entity.id,
    email: entity.email,
    name: entity.name,
    avatar: entity.avatar || null,
    role: entity.role,
    status: entity.status,
    timezone: metadata?.timezone || 'UTC',
    locale: metadata?.locale || 'en-US',
    theme: preferences?.theme || 'system',
    email_notifications: notifications?.email ? 1 : 0,
    push_notifications: notifications?.push ? 1 : 0,
    sms_notifications: notifications?.sms ? 1 : 0,
    notification_frequency: notifications?.frequency || 'instant',
    dashboard_layout: dashboard?.layout || 'grid',
    dashboard_default_view: dashboard?.defaultView || 'tasks',
    dashboard_widgets: JSON.stringify(dashboard?.widgets || ['tasks', 'projects']),
  };
}
