import { taskRepository } from '../repositories/taskRepository.js';
import { tagRepository } from '../repositories/tagRepository.js';
import { CreateTaskInput, UpdateTaskInput, TaskResponse, TaskFilters, toTaskResponse } from '../models/task.js';
import { toTagResponse } from '../models/tag.js';
import { AppError } from './authService.js';
import { createPaginatedResponse, PaginatedResponse, PaginationParams } from '../utils/pagination.js';

export class TaskService {
  async create(input: CreateTaskInput, userId: string): Promise<TaskResponse> {
    if (!input.title || !input.title.trim()) {
      throw new AppError('Title is required', 400);
    }
    const task = await taskRepository.create(input, userId);
    return toTaskResponse(task);
  }

  async findById(id: string, userId: string): Promise<TaskResponse> {
    const task = await taskRepository.findById(id);
    
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    if (task.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    const tags = await tagRepository.getTagsForTask(id);
    return toTaskResponse(task, tags.map(toTagResponse));
  }

  async update(id: string, input: UpdateTaskInput, userId: string): Promise<TaskResponse> {
    const existingTask = await taskRepository.findById(id);
    
    if (!existingTask) {
      throw new AppError('Task not found', 404);
    }

    if (existingTask.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    const updatedTask = await taskRepository.update(id, input);
    const tags = await tagRepository.getTagsForTask(id);
    return toTaskResponse(updatedTask!, tags.map(toTagResponse));
  }

  async delete(id: string, userId: string): Promise<void> {
    const task = await taskRepository.findById(id);
    
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    if (task.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    await taskRepository.delete(id);
  }

  async findAll(
    userId: string,
    filters: TaskFilters = {},
    params: PaginationParams
  ): Promise<PaginatedResponse<TaskResponse>> {
    const [tasks, total] = await Promise.all([
      taskRepository.findByUser(userId, filters, params.limit, params.offset),
      taskRepository.countByUser(userId, filters),
    ]);

    const ownedTasks = tasks.filter(task => task.userId === userId);

    const taskIds = ownedTasks.map(t => t.id);
    const tagMap = await tagRepository.getTagsForTasks(taskIds);

    const data = ownedTasks.map(task => toTaskResponse(task, (tagMap.get(task.id) || []).map(toTagResponse)));
    return createPaginatedResponse(data, total, params);
  }

  async getStats(userId: string): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  }> {
    return taskRepository.getTaskStats(userId);
  }

  async markAsCompleted(id: string, userId: string): Promise<TaskResponse> {
    return this.update(id, { status: 'completed' }, userId);
  }

  async markAsInProgress(id: string, userId: string): Promise<TaskResponse> {
    return this.update(id, { status: 'in_progress' }, userId);
  }

  async cancel(id: string, userId: string): Promise<TaskResponse> {
    return this.update(id, { status: 'cancelled' }, userId);
  }

  async assignTo(id: string, assignedTo: string, userId: string): Promise<TaskResponse> {
    return this.update(id, { assignedTo }, userId);
  }

  async findOverdueTasks(userId: string): Promise<TaskResponse[]> {
    const tasks = await taskRepository.findOverdueTasks(userId);
    const taskIds = tasks.map(t => t.id);
    const tagMap = await tagRepository.getTagsForTasks(taskIds);
    return tasks.map(task => toTaskResponse(task, (tagMap.get(task.id) || []).map(toTagResponse)));
  }
}

export const taskService = new TaskService();
