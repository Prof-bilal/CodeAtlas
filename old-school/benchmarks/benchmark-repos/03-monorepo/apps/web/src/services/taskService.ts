import { ApiClient } from './apiClient.js';
import { Task, PaginationParams } from '../types/index.js';
import { CreateTaskRequest, UpdateTaskRequest, ApiResponse } from '../types/api.js';

export class TaskService {
  private apiClient: ApiClient;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  async getTasks(params?: PaginationParams & { projectId?: string; status?: string; assigneeId?: string }): Promise<ApiResponse<Task[]>> {
    return this.apiClient.get<Task[]>('/tasks', params as Record<string, string | number | boolean>);
  }

  async getTask(id: string): Promise<Task> {
    const response = await this.apiClient.get<Task>(`/tasks/${id}`);
    if (response.success && response.data) return response.data;
    throw new Error(response.error?.message || 'Task not found');
  }

  async createTask(request: CreateTaskRequest): Promise<Task> {
    const response = await this.apiClient.post<Task>('/tasks', request);
    if (response.success && response.data) return response.data;
    throw new Error(response.error?.message || 'Failed to create task');
  }

  async updateTask(id: string, request: UpdateTaskRequest): Promise<Task> {
    const response = await this.apiClient.patch<Task>(`/tasks/${id}`, request);
    if (response.success && response.data) return response.data;
    throw new Error(response.error?.message || 'Failed to update task');
  }

  async deleteTask(id: string): Promise<void> {
    const response = await this.apiClient.delete(`/tasks/${id}`);
    if (!response.success) throw new Error(response.error?.message || 'Failed to delete task');
  }

  async getTasksByProject(projectId: string): Promise<Task[]> {
    const response = await this.apiClient.get<Task[]>('/tasks', { projectId });
    if (response.success && response.data) return response.data;
    return [];
  }

  async getTasksByAssignee(assigneeId: string): Promise<Task[]> {
    const response = await this.apiClient.get<Task[]>('/tasks', { assigneeId });
    if (response.success && response.data) return response.data;
    return [];
  }

  async getOverdueTasks(): Promise<Task[]> {
    const response = await this.apiClient.get<Task[]>('/tasks/overdue');
    if (response.success && response.data) return response.data;
    return [];
  }

  async bulkUpdateTasks(ids: string[], updates: Partial<Task>): Promise<Task[]> {
    const response = await this.apiClient.post<Task[]>('/tasks/bulk', { ids, updates });
    if (response.success && response.data) return response.data;
    return [];
  }

  async searchTasks(query: string): Promise<Task[]> {
    const response = await this.apiClient.get<Task[]>('/tasks/search', { q: query });
    if (response.success && response.data) return response.data;
    return [];
  }
}
