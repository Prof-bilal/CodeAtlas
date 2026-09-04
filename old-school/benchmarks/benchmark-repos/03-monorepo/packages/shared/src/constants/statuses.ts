export const TASK_STATUSES = {
  BACKLOG: 'backlog',
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  IN_REVIEW: 'in_review',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const;

export type TaskStatus = typeof TASK_STATUSES[keyof typeof TASK_STATUSES];

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: string }> = {
  backlog: { label: 'Backlog', color: '#6b7280', icon: '📋' },
  todo: { label: 'To Do', color: '#3b82f6', icon: '📝' },
  in_progress: { label: 'In Progress', color: '#f59e0b', icon: '🔄' },
  in_review: { label: 'In Review', color: '#8b5cf6', icon: '👀' },
  done: { label: 'Done', color: '#10b981', icon: '✅' },
  cancelled: { label: 'Cancelled', color: '#ef4444', icon: '❌' },
};

export const TASK_PRIORITIES = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type TaskPriority = typeof TASK_PRIORITIES[keyof typeof TASK_PRIORITIES];

export const TASK_PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; weight: number }> = {
  critical: { label: 'Critical', color: '#dc2626', weight: 4 },
  high: { label: 'High', color: '#f97316', weight: 3 },
  medium: { label: 'Medium', color: '#eab308', weight: 2 },
  low: { label: 'Low', color: '#22c55e', weight: 1 },
};

export const PROJECT_STATUSES = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type ProjectStatus = typeof PROJECT_STATUSES[keyof typeof PROJECT_STATUSES];

export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string }> = {
  planning: { label: 'Planning', color: '#6366f1' },
  active: { label: 'Active', color: '#10b981' },
  on_hold: { label: 'On Hold', color: '#f59e0b' },
  completed: { label: 'Completed', color: '#3b82f6' },
  archived: { label: 'Archived', color: '#6b7280' },
};

export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUSES[keyof typeof PAYMENT_STATUSES];

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#f59e0b' },
  processing: { label: 'Processing', color: '#3b82f6' },
  completed: { label: 'Completed', color: '#10b981' },
  failed: { label: 'Failed', color: '#ef4444' },
  cancelled: { label: 'Cancelled', color: '#6b7280' },
  refunded: { label: 'Refunded', color: '#8b5cf6' },
};

export const USER_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING: 'pending',
} as const;

export type UserStatus = typeof USER_STATUSES[keyof typeof USER_STATUSES];

export const USER_STATUS_CONFIG: Record<UserStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: '#10b981' },
  inactive: { label: 'Inactive', color: '#6b7280' },
  suspended: { label: 'Suspended', color: '#ef4444' },
  pending: { label: 'Pending', color: '#f59e0b' },
};

export const SUBSCRIPTION_STATUSES = {
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELLED: 'cancelled',
  TRIALING: 'trialing',
  PAUSED: 'paused',
} as const;

export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[keyof typeof SUBSCRIPTION_STATUSES];
