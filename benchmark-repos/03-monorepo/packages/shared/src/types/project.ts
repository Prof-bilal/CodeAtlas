import { User } from './user.js';
import { Task } from './task.js';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  ownerId: string;
  owner?: User;
  members: ProjectMember[];
  tasks: Task[];
  tags: string[];
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  spent: number;
  createdAt: Date;
  updatedAt: Date;
  settings: ProjectSettings;
}

export interface ProjectMember {
  userId: string;
  user?: User;
  role: ProjectMemberRole;
  joinedAt: Date;
  permissions: ProjectPermission[];
}

export interface ProjectSettings {
  visibility: 'public' | 'private' | 'team';
  allowExternalCollaborators: boolean;
  defaultTaskPriority: string;
  autoArchive: boolean;
  notifications: ProjectNotificationSettings;
}

export interface ProjectNotificationSettings {
  taskCreated: boolean;
  taskCompleted: boolean;
  memberJoined: boolean;
  deadlineApproaching: boolean;
  deadlineDays: number;
}

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
export type ProjectMemberRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ProjectPermission = 'read' | 'write' | 'delete' | 'manage_members' | 'manage_settings';

export interface CreateProjectRequest {
  name: string;
  description: string;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  settings?: Partial<ProjectSettings>;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  settings?: Partial<ProjectSettings>;
}

export interface ProjectFilter {
  status?: ProjectStatus[];
  ownerId?: string;
  memberIds?: string[];
  tags?: string[];
  search?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  budgetMin?: number;
  budgetMax?: number;
}

export interface ProjectStats {
  totalTasks: number;
  completedTasks: number;
  totalMembers: number;
  budgetUsage: number;
  daysRemaining?: number;
  healthScore: number;
}

export function getProjectHealth(project: Project): 'good' | 'warning' | 'critical' {
  if (project.status !== 'active') return 'good';
  const stats = calculateProjectStats(project);
  if (stats.budgetUsage > 100) return 'critical';
  if (stats.budgetUsage > 80 || (stats.daysRemaining !== undefined && stats.daysRemaining < 7)) {
    return 'warning';
  }
  return 'good';
}

export function calculateProjectStats(project: Project): ProjectStats {
  const totalTasks = project.tasks.length;
  const completedTasks = project.tasks.filter(t => t.status === 'done').length;
  const totalMembers = project.members.length;
  const budgetUsage = project.budget ? (project.spent / project.budget) * 100 : 0;
  let daysRemaining: number | undefined;
  if (project.endDate) {
    const now = new Date();
    const end = new Date(project.endDate);
    daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }
  const taskCompletion = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const budgetScore = budgetUsage <= 100 ? 100 : 0;
  const healthScore = Math.round((taskCompletion + budgetScore) / 2);
  return { totalTasks, completedTasks, totalMembers, budgetUsage, daysRemaining, healthScore };
}

export function isMember(project: Project, userId: string): boolean {
  return project.members.some(m => m.userId === userId);
}

export function getMemberRole(project: Project, userId: string): ProjectMemberRole | undefined {
  return project.members.find(m => m.userId === userId)?.role;
}
