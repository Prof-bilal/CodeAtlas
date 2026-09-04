export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalTeamMembers: number;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  userId: string;
  userName: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  status: string;
  tasksAssigned: number;
  tasksCompleted: number;
  joinedAt: string;
}

export interface ProjectStats {
  projectId: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  completionRate: number;
  budgetUsage: number;
  daysRemaining?: number;
}

export interface TaskMetrics {
  totalTasks: number;
  completedTasks: number;
  averageCompletionTime: number;
  tasksByAssignee: Record<string, number>;
  tasksByProject: Record<string, number>;
}

export interface PaymentSummary {
  totalRevenue: number;
  totalRefunds: number;
  netRevenue: number;
  revenueByMonth: Array<{ month: string; amount: number }>;
  topPaymentMethods: Array<{ method: string; count: number; amount: number }>;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  frequency: 'instant' | 'daily' | 'weekly';
  types: Record<string, boolean>;
}

export interface DashboardWidget {
  id: string;
  type: string;
  title: string;
  size: 'sm' | 'md' | 'lg';
  config?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  type: 'task' | 'project' | 'user' | 'file';
  title: string;
  description?: string;
  url: string;
  score: number;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  details?: Record<string, unknown>;
  timestamp: string;
}
