import { User } from './user.js';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  assignee?: User;
  projectId: string;
  tags: string[];
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  dependencies: string[];
  subtasks: Subtask[];
  attachments: Attachment[];
  comments: Comment[];
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  author?: User;
  createdAt: Date;
  updatedAt?: Date;
  mentions: string[];
}

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface CreateTaskRequest {
  title: string;
  description: string;
  projectId: string;
  priority?: TaskPriority;
  assigneeId?: string;
  tags?: string[];
  dueDate?: Date;
  estimatedHours?: number;
  dependencies?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  tags?: string[];
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  dependencies?: string[];
}

export interface TaskFilter {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assigneeId?: string;
  projectId?: string;
  tags?: string[];
  search?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface TaskMetrics {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  averageCompletionTime: number;
  tasksByStatus: Record<TaskStatus, number>;
  tasksByPriority: Record<TaskPriority, number>;
}

export function isOverdue(task: Task): boolean {
  if (!task.dueDate) return false;
  return task.dueDate < new Date() && task.status !== 'done' && task.status !== 'cancelled';
}

export function getTaskAge(task: Task): number {
  const now = new Date();
  const created = new Date(task.createdAt);
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

export function canTransitionTo(current: TaskStatus, next: TaskStatus): boolean {
  const transitions: Record<TaskStatus, TaskStatus[]> = {
    backlog: ['todo', 'cancelled'],
    todo: ['in_progress', 'backlog', 'cancelled'],
    in_progress: ['in_review', 'todo', 'cancelled'],
    in_review: ['done', 'in_progress', 'cancelled'],
    done: ['in_progress'],
    cancelled: ['backlog'],
  };
  return transitions[current]?.includes(next) ?? false;
}

export function calculateProgress(task: Task): number {
  if (task.subtasks.length === 0) {
    return task.status === 'done' ? 100 : 0;
  }
  const completed = task.subtasks.filter(s => s.completed).length;
  return Math.round((completed / task.subtasks.length) * 100);
}
