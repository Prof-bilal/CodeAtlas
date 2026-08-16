import { ApiClient } from './apiClient.js';
import { Project, PaginationParams } from '../types/index.js';
import { CreateProjectRequest, UpdateProjectRequest, ApiResponse } from '../types/api.js';

export class ProjectService {
  private apiClient: ApiClient;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  async getProjects(params?: PaginationParams & { status?: string; ownerId?: string }): Promise<ApiResponse<Project[]>> {
    return this.apiClient.get<Project[]>('/projects', params as Record<string, string | number | boolean>);
  }

  async getProject(id: string): Promise<Project> {
    const response = await this.apiClient.get<Project>(`/projects/${id}`);
    if (response.success && response.data) return response.data;
    throw new Error(response.error?.message || 'Project not found');
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    const response = await this.apiClient.post<Project>('/projects', request);
    if (response.success && response.data) return response.data;
    throw new Error(response.error?.message || 'Failed to create project');
  }

  async updateProject(id: string, request: UpdateProjectRequest): Promise<Project> {
    const response = await this.apiClient.patch<Project>(`/projects/${id}`, request);
    if (response.success && response.data) return response.data;
    throw new Error(response.error?.message || 'Failed to update project');
  }

  async deleteProject(id: string): Promise<void> {
    const response = await this.apiClient.delete(`/projects/${id}`);
    if (!response.success) throw new Error(response.error?.message || 'Failed to delete project');
  }

  async getMyProjects(): Promise<Project[]> {
    const response = await this.apiClient.get<Project[]>('/projects/mine');
    if (response.success && response.data) return response.data;
    return [];
  }

  async addMember(projectId: string, userId: string, role: string): Promise<void> {
    const response = await this.apiClient.post(`/projects/${projectId}/members`, { userId, role });
    if (!response.success) throw new Error(response.error?.message || 'Failed to add member');
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    const response = await this.apiClient.delete(`/projects/${projectId}/members/${userId}`);
    if (!response.success) throw new Error(response.error?.message || 'Failed to remove member');
  }

  async getProjectStats(projectId: string): Promise<Record<string, unknown>> {
    const response = await this.apiClient.get<Record<string, unknown>>(`/projects/${projectId}/stats`);
    if (response.success && response.data) return response.data;
    return {};
  }
}
