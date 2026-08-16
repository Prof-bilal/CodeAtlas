export interface CreateProjectRequest {
  name: string;
  description: string;
  tags?: string[];
  startDate?: string;
  endDate?: string;
  budget?: number;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: string;
  tags?: string[];
  startDate?: string;
  endDate?: string;
  budget?: number;
}

export interface ProjectResponse {
  id: string;
  name: string;
  description: string;
  status: string;
  ownerId: string;
  tags: string[];
  startDate?: string;
  endDate?: string;
  budget?: number;
  spent: number;
  members: Array<{ userId: string; role: string; joinedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export class ProjectController {
  private projects: Map<string, ProjectResponse> = new Map();

  async getProjects(filters?: { status?: string; ownerId?: string }): Promise<ProjectResponse[]> {
    let projects = Array.from(this.projects.values());
    if (filters?.status) projects = projects.filter(p => p.status === filters.status);
    if (filters?.ownerId) projects = projects.filter(p => p.ownerId === filters.ownerId);
    return projects;
  }

  async getProject(id: string): Promise<ProjectResponse> {
    const project = this.projects.get(id);
    if (!project) throw new Error('Project not found');
    return project;
  }

  async createProject(request: CreateProjectRequest, ownerId: string): Promise<ProjectResponse> {
    const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const project: ProjectResponse = {
      id,
      name: request.name,
      description: request.description,
      status: 'planning',
      ownerId,
      tags: request.tags || [],
      startDate: request.startDate,
      endDate: request.endDate,
      budget: request.budget,
      spent: 0,
      members: [{ userId: ownerId, role: 'owner', joinedAt: now }],
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, request: UpdateProjectRequest): Promise<ProjectResponse> {
    const project = this.projects.get(id);
    if (!project) throw new Error('Project not found');
    const updated = { ...project, ...request, updatedAt: new Date().toISOString() };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.projects.has(id)) throw new Error('Project not found');
    this.projects.delete(id);
  }

  async addMember(projectId: string, userId: string, role: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) throw new Error('Project not found');
    if (project.members.some(m => m.userId === userId)) throw new Error('User is already a member');
    project.members.push({ userId, role, joinedAt: new Date().toISOString() });
    project.updatedAt = new Date().toISOString();
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) throw new Error('Project not found');
    const index = project.members.findIndex(m => m.userId === userId);
    if (index === -1) throw new Error('User is not a member');
    project.members.splice(index, 1);
    project.updatedAt = new Date().toISOString();
  }

  async getProjectStats(projectId: string) {
    const project = this.projects.get(projectId);
    if (!project) throw new Error('Project not found');
    return {
      totalMembers: project.members.length,
      budgetUsage: project.budget ? (project.spent / project.budget) * 100 : 0,
    };
  }

  async searchProjects(query: string): Promise<ProjectResponse[]> {
    const lower = query.toLowerCase();
    return Array.from(this.projects.values()).filter(
      p => p.name.toLowerCase().includes(lower) || p.description.toLowerCase().includes(lower)
    );
  }
}

export function createProjectController(): ProjectController {
  return new ProjectController();
}
