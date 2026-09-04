export const PROJECTS_TABLE = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  owner_id TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  start_date TEXT,
  end_date TEXT,
  budget REAL,
  spent REAL DEFAULT 0,
  visibility TEXT DEFAULT 'team',
  allow_external_collaborators INTEGER DEFAULT 0,
  default_task_priority TEXT DEFAULT 'medium',
  auto_archive INTEGER DEFAULT 0,
  notification_task_created INTEGER DEFAULT 1,
  notification_task_completed INTEGER DEFAULT 1,
  notification_member_joined INTEGER DEFAULT 1,
  notification_deadline_approaching INTEGER DEFAULT 1,
  notification_deadline_days INTEGER DEFAULT 3,
  members TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id)
)`;

export const PROJECTS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)',
  'CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id)',
  'CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at)',
];

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  owner_id: string;
  tags: string;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  spent: number;
  visibility: string;
  allow_external_collaborators: number;
  default_task_priority: string;
  auto_archive: number;
  notification_task_created: number;
  notification_task_completed: number;
  notification_member_joined: number;
  notification_deadline_approaching: number;
  notification_deadline_days: number;
  members: string;
  created_at: string;
  updated_at: string;
}

export function projectRowToEntity(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    status: row.status,
    ownerId: row.owner_id,
    tags: JSON.parse(row.tags),
    startDate: row.start_date ? new Date(row.start_date) : undefined,
    endDate: row.end_date ? new Date(row.end_date) : undefined,
    budget: row.budget || undefined,
    spent: row.spent,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    settings: {
      visibility: row.visibility,
      allowExternalCollaborators: row.allow_external_collaborators === 1,
      defaultTaskPriority: row.default_task_priority,
      autoArchive: row.auto_archive === 1,
      notifications: {
        taskCreated: row.notification_task_created === 1,
        taskCompleted: row.notification_task_completed === 1,
        memberJoined: row.notification_member_joined === 1,
        deadlineApproaching: row.notification_deadline_approaching === 1,
        deadlineDays: row.notification_deadline_days,
      },
    },
    members: JSON.parse(row.members),
  };
}

export function projectEntityToRow(entity: Record<string, unknown>) {
  const settings = entity.settings as Record<string, unknown>;
  const notifications = settings?.notifications as Record<string, unknown>;
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description || null,
    status: entity.status,
    owner_id: entity.ownerId,
    tags: JSON.stringify(entity.tags || []),
    start_date: entity.startDate ? new Date(entity.startDate as string).toISOString() : null,
    end_date: entity.endDate ? new Date(entity.endDate as string).toISOString() : null,
    budget: entity.budget || null,
    spent: entity.spent || 0,
    visibility: settings?.visibility || 'team',
    allow_external_collaborators: settings?.allowExternalCollaborators ? 1 : 0,
    default_task_priority: settings?.defaultTaskPriority || 'medium',
    auto_archive: settings?.autoArchive ? 1 : 0,
    notification_task_created: notifications?.taskCreated ? 1 : 0,
    notification_task_completed: notifications?.taskCompleted ? 1 : 0,
    notification_member_joined: notifications?.memberJoined ? 1 : 0,
    notification_deadline_approaching: notifications?.deadlineApproaching ? 1 : 0,
    notification_deadline_days: notifications?.deadlineDays || 3,
    members: JSON.stringify(entity.members || []),
  };
}
