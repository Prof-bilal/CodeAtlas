import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { EventBus } from '../../events/eventBus.js';
import { cacheService } from '../../services/cacheService.js';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: number;
  userId: string;
  assignedTo?: string;
  dueDate?: Date;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskDTO {
  title: string;
  description?: string;
  priority?: number;
  userId: string;
  assignedTo?: string;
  dueDate?: string;
  tags?: string[];
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  status?: Task['status'];
  priority?: number;
  assignedTo?: string;
  dueDate?: string;
  tags?: string[];
}

export interface TaskOptions {
  status?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class TaskService {
  private tasks: Task[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async createTask(data: CreateTaskDTO): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      title: data.title,
      description: data.description || '',
      status: 'pending',
      priority: data.priority || 0,
      userId: data.userId,
      assignedTo: data.assignedTo,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      tags: data.tags || [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tasks.push(task);
    await cacheService.invalidate(`tasks:${data.userId}`);
    this.eventBus.emit('task:created', { task });

    return task;
  }

  async getTasksByUser(userId: string, options: TaskOptions): Promise<Task[]> {
    let tasks = this.tasks.filter(t => t.userId === userId);

    if (options.status) {
      tasks = tasks.filter(t => t.status === options.status);
    }

    if (options.sortBy) {
      tasks.sort((a, b) => {
        const aVal = a[options.sortBy as keyof Task] as any;
        const bVal = b[options.sortBy as keyof Task] as any;
        const order = options.sortOrder === 'desc' ? -1 : 1;
        return (aVal > bVal ? 1 : aVal < bVal ? -1 : 0) * order;
      });
    }

    const offset = options.offset || 0;
    const limit = options.limit || 20;
    return tasks.slice(offset, offset + limit);
  }

  async getTask(id: string): Promise<Task> {
    const task = this.tasks.find(t => t.id === id);
    if (!task) {
      throw new Error('Task not found');
    }
    return task;
  }

  async updateTask(id: string, data: UpdateTaskDTO): Promise<Task> {
    const index = this.tasks.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Task not found');
    }

    this.tasks[index] = {
      ...this.tasks[index],
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : this.tasks[index].dueDate,
      updatedAt: new Date(),
    };

    await cacheService.invalidate(`tasks:${this.tasks[index].userId}`);
    this.eventBus.emit('task:updated', { task: this.tasks[index] });

    return this.tasks[index];
  }

  async deleteTask(id: string): Promise<void> {
    const index = this.tasks.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Task not found');
    }

    const [deletedTask] = this.tasks.splice(index, 1);
    await cacheService.invalidate(`tasks:${deletedTask.userId}`);
    this.eventBus.emit('task:deleted', { taskId: id });
  }

  async completeTask(id: string): Promise<Task> {
    const task = await this.updateTask(id, { status: 'completed' });
    this.eventBus.emit('task:completed', { task });
    return task;
  }

  async assignTask(id: string, assigneeId: string): Promise<Task> {
    const task = await this.updateTask(id, { assignedTo: assigneeId });
    this.eventBus.emit('task:assigned', { task, assigneeId });
    return task;
  }

  async addComment(taskId: string, userId: string, content: string): Promise<any> {
    const comment = {
      id: uuidv4(),
      taskId,
      userId,
      content,
      createdAt: new Date(),
    };

    this.eventBus.emit('task:comment:added', { taskId, comment });
    return comment;
  }

  async getComments(taskId: string): Promise<any[]> {
    return [];
  }

  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date();
    return this.tasks.filter(t => t.dueDate && t.dueDate < now && t.status !== 'completed');
  }

  async getTaskStats(userId: string): Promise<{ total: number; pending: number; completed: number; overdue: number }> {
    const userTasks = this.tasks.filter(t => t.userId === userId);
    const now = new Date();
    return {
      total: userTasks.length,
      pending: userTasks.filter(t => t.status === 'pending').length,
      completed: userTasks.filter(t => t.status === 'completed').length,
      overdue: userTasks.filter(t => t.dueDate && t.dueDate < now && t.status !== 'completed').length,
    };
  }
}

export const taskService = new TaskService(new EventBus());
