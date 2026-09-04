export interface TaskModel {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: Date | null;
  userId: string;
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  assignedTo?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string | null;
  assignedTo?: string | null;
}

export interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  userId: string;
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskFilters {
  status?: string;
  priority?: string;
  assignedTo?: string;
  search?: string;
}

export function toTaskResponse(task: TaskModel): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    userId: task.userId,
    assignedTo: task.assignedTo,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function isValidStatus(status: string): status is TaskModel['status'] {
  return ['pending', 'in_progress', 'completed', 'cancelled'].includes(status);
}

export function isValidPriority(priority: string): priority is TaskModel['priority'] {
  return ['low', 'medium', 'high', 'urgent'].includes(priority);
}
