export * from './api.js';
export * from './models.js';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'manager' | 'member' | 'viewer';
  status: 'active' | 'inactive' | 'suspended' | 'pending';
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
  assigneeId?: string;
  projectId: string;
  tags: string[];
  dueDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
  ownerId: string;
  tags: string[];
  startDate?: string;
  endDate?: string;
  budget?: number;
  spent: number;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  provider: string;
  description: string;
  createdAt: string;
}
