import { BaseRepository, BaseEntity, FindOptions, CountOptions } from '../BaseRepository.js';

export interface ProjectEntity extends BaseEntity {
  name: string;
  description: string;
  status: string;
  ownerId: string;
  tags: string[];
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  spent: number;
  settings: Record<string, unknown>;
  members: Array<{ userId: string; role: string; joinedAt: Date }>;
}

export interface ProjectFilter {
  status?: string[];
  ownerId?: string;
  memberIds?: string[];
  tags?: string[];
  search?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export class ProjectRepository extends BaseRepository<ProjectEntity> {
  private projects: Map<string, ProjectEntity> = new Map();
  private ownerIndex: Map<string, Set<string>> = new Map();

  constructor() {
    super('projects');
  }

  async findById(id: string): Promise<ProjectEntity | null> {
    return this.projects.get(id) || null;
  }

  async findMany(options: FindOptions = {}): Promise<ProjectEntity[]> {
    let projects = Array.from(this.projects.values());
    if (options.orderBy) {
      const dir = options.orderDirection === 'DESC' ? -1 : 1;
      projects.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[options.orderBy!];
        const bVal = (b as Record<string, unknown>)[options.orderBy!];
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }
    if (options.offset) projects = projects.slice(options.offset);
    if (options.limit) projects = projects.slice(0, options.limit);
    return projects;
  }

  async findByOwner(ownerId: string): Promise<ProjectEntity[]> {
    const projectIds = this.ownerIndex.get(ownerId) || new Set();
    return Array.from(projectIds)
      .map(id => this.projects.get(id))
      .filter((p): p is ProjectEntity => p !== undefined);
  }

  async findByMember(userId: string): Promise<ProjectEntity[]> {
    return Array.from(this.projects.values()).filter(p =>
      p.members.some(m => m.userId === userId)
    );
  }

  async findWithFilter(filter: ProjectFilter): Promise<ProjectEntity[]> {
    let projects = Array.from(this.projects.values());
    if (filter.status && filter.status.length > 0) {
      projects = projects.filter(p => filter.status!.includes(p.status));
    }
    if (filter.ownerId) {
      projects = projects.filter(p => p.ownerId === filter.ownerId);
    }
    if (filter.memberIds && filter.memberIds.length > 0) {
      projects = projects.filter(p =>
        p.members.some(m => filter.memberIds!.includes(m.userId))
      );
    }
    if (filter.tags && filter.tags.length > 0) {
      projects = projects.filter(p => filter.tags!.some(tag => p.tags.includes(tag)));
    }
    if (filter.search) {
      const search = filter.search.toLowerCase();
      projects = projects.filter(p =>
        p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search)
      );
    }
    return projects;
  }

  async create(data: Omit<ProjectEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectEntity> {
    const id = this.generateId();
    const now = new Date();
    const project: ProjectEntity = { ...data, id, createdAt: now, updatedAt: now };
    this.projects.set(id, project);
    if (!this.ownerIndex.has(data.ownerId)) {
      this.ownerIndex.set(data.ownerId, new Set());
    }
    this.ownerIndex.get(data.ownerId)!.add(id);
    return project;
  }

  async update(id: string, data: Partial<ProjectEntity>): Promise<ProjectEntity | null> {
    const project = this.projects.get(id);
    if (!project) return null;
    const updated = { ...project, ...data, updatedAt: new Date() };
    this.projects.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const project = this.projects.get(id);
    if (!project) return false;
    this.projects.delete(id);
    this.ownerIndex.get(project.ownerId)?.delete(id);
    return true;
  }

  async count(options: CountOptions = {}): Promise<number> {
    return this.projects.size;
  }

  async addMember(projectId: string, userId: string, role: string): Promise<boolean> {
    const project = this.projects.get(projectId);
    if (!project) return false;
    if (project.members.some(m => m.userId === userId)) return false;
    project.members.push({ userId, role, joinedAt: new Date() });
    project.updatedAt = new Date();
    return true;
  }

  async removeMember(projectId: string, userId: string): Promise<boolean> {
    const project = this.projects.get(projectId);
    if (!project) return false;
    const index = project.members.findIndex(m => m.userId === userId);
    if (index === -1) return false;
    project.members.splice(index, 1);
    project.updatedAt = new Date();
    return true;
  }

  async getProjectStats(projectId: string): Promise<{
    totalMembers: number;
    totalTasks: number;
    budgetUsage: number;
  }> {
    const project = this.projects.get(projectId);
    if (!project) return { totalMembers: 0, totalTasks: 0, budgetUsage: 0 };
    return {
      totalMembers: project.members.length,
      totalTasks: 0,
      budgetUsage: project.budget ? (project.spent / project.budget) * 100 : 0,
    };
  }
}
