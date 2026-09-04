import { TaskRepository } from '../database/repositories/taskRepository.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';

export interface TaskService {
  getTask(id: string): Promise<any>;
  getTasksByUser(userId: string, options?: any): Promise<any[]>;
  createTask(data: any): Promise<any>;
  updateTask(id: string, data: any): Promise<any>;
  deleteTask(id: string): Promise<boolean>;
  completeTask(id: string): Promise<any>;
  assignTask(id: string, assigneeId: string): Promise<any>;
  getOverdueTasks(): Promise<any[]>;
}

export class TaskServiceImpl implements TaskService {
  private taskRepository: TaskRepository;

  constructor() {
    this.taskRepository = new TaskRepository();
  }

  async getTask(id: string): Promise<any> {
    const task = await this.taskRepository.findById(id);
    if (!task) {
      throw new Error('Task not found');
    }
    return task;
  }

  async getTasksByUser(userId: string, options?: { status?: string; limit?: number; offset?: number }): Promise<any[]> {
    return this.taskRepository.findByUserId(userId, options);
  }

  async createTask(data: any): Promise<any> {
    const task = await this.taskRepository.create(data);

    await eventBus.publish('task.created', {
      taskId: task.id,
      userId: data.userId,
      title: data.title,
    }, 'task-service');

    return task;
  }

  async updateTask(id: string, data: any): Promise<any> {
    const task = await this.taskRepository.findById(id);
    if (!task) {
      throw new Error('Task not found');
    }

    const updatedTask = await this.taskRepository.update(id, data);

    await eventBus.publish('task.updated', {
      taskId: id,
      changes: data,
    }, 'task-service');

    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    const task = await this.taskRepository.findById(id);
    if (!task) {
      throw new Error('Task not found');
    }

    const deleted = await this.taskRepository.delete(id);

    await eventBus.publish('task.deleted', {
      taskId: id,
    }, 'task-service');

    return deleted;
  }

  async completeTask(id: string): Promise<any> {
    const task = await this.taskRepository.findById(id);
    if (!task) {
      throw new Error('Task not found');
    }

    const updatedTask = await this.taskRepository.update(id, { status: 'completed' });

    await eventBus.publish('task.completed', {
      taskId: id,
      userId: task.userId,
      completedAt: new Date(),
    }, 'task-service');

    return updatedTask;
  }

  async assignTask(id: string, assigneeId: string): Promise<any> {
    const task = await this.taskRepository.findById(id);
    if (!task) {
      throw new Error('Task not found');
    }

    const updatedTask = await this.taskRepository.update(id, { assignedTo: assigneeId });

    await eventBus.publish('task.assigned', {
      taskId: id,
      assigneeId,
      assignerId: task.userId,
    }, 'task-service');

    return updatedTask;
  }

  async getOverdueTasks(): Promise<any[]> {
    return this.taskRepository.findOverdue();
  }
}

export const taskService = new TaskServiceImpl();
