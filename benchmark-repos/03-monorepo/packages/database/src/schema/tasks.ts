export const TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  assignee_id TEXT,
  project_id TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  due_date TEXT,
  estimated_hours REAL,
  actual_hours REAL,
  created_by TEXT NOT NULL,
  dependencies TEXT DEFAULT '[]',
  subtasks TEXT DEFAULT '[]',
  attachments TEXT DEFAULT '[]',
  comments TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (assignee_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
)`;

export const TASKS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)',
];

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  project_id: string;
  tags: string;
  due_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  created_by: string;
  dependencies: string;
  subtasks: string;
  attachments: string;
  comments: string;
  created_at: string;
  updated_at: string;
}

export function taskRowToEntity(row: TaskRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id || undefined,
    projectId: row.project_id,
    tags: JSON.parse(row.tags),
    dueDate: row.due_date ? new Date(row.due_date) : undefined,
    estimatedHours: row.estimated_hours || undefined,
    actualHours: row.actual_hours || undefined,
    createdBy: row.created_by,
    dependencies: JSON.parse(row.dependencies),
    subtasks: JSON.parse(row.subtasks),
    attachments: JSON.parse(row.attachments),
    comments: JSON.parse(row.comments),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function taskEntityToRow(entity: Record<string, unknown>) {
  return {
    id: entity.id,
    title: entity.title,
    description: entity.description || null,
    status: entity.status,
    priority: entity.priority,
    assignee_id: entity.assigneeId || null,
    project_id: entity.projectId,
    tags: JSON.stringify(entity.tags || []),
    due_date: entity.dueDate ? new Date(entity.dueDate as string).toISOString() : null,
    estimated_hours: entity.estimatedHours || null,
    actual_hours: entity.actualHours || null,
    created_by: entity.createdBy,
    dependencies: JSON.stringify(entity.dependencies || []),
    subtasks: JSON.stringify(entity.subtasks || []),
    attachments: JSON.stringify(entity.attachments || []),
    comments: JSON.stringify(entity.comments || []),
  };
}
