import { BaseRepository, BaseEntity, FindOptions, CountOptions } from '../BaseRepository.js';

export interface TaskEntity extends BaseEntity {
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId?: string;
  projectId: string;
  tags: string[];
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  createdBy: string;
  dependencies: string[];
  subtasks: Array<{ id: string; title: string; completed: boolean }>;
  attachments: Array<{ id: string; filename: string; url: string }>;
  comments: Array<{ id: string; content: string; authorId: string; createdAt: Date }>;
}

export interface TaskFilter {
  status?: string[];
  priority?: string[];
  assigneeId?: string;
  projectId?: string;
  tags?: string[];
  search?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  createdAfter?: Date;
  createdBefore?: Date;
}

export class TaskRepository extends BaseRepository<TaskEntity> {
  private tasks: Map<string, TaskEntity> = new Map();
  private projectIndex: Map<string, Set<string>> = new Map();
  private assigneeIndex: Map<string, Set<string>> = new Map();

  constructor() {
    super('tasks');
  }

  async findById(id: string): Promise<TaskEntity | null> {
    return this.tasks.get(id) || null;
  }

  async findMany(options: FindOptions = {}): Promise<TaskEntity[]> {
    let tasks = Array.from(this.tasks.values());
    if (options.orderBy) {
      const dir = options.orderDirection === 'DESC' ? -1 : 1;
      tasks.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[options.orderBy!];
        const bVal = (b as Record<string, unknown>)[options.orderBy!];
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }
    if (options.offset) tasks = tasks.slice(options.offset);
    if (options.limit) tasks = tasks.slice(0, options.limit);
    return tasks;
  }

  async findByProject(projectId: string): Promise<TaskEntity[]> {
    const taskIds = this.projectIndex.get(projectId) || new Set();
    return Array.from(taskIds).map(id => this.tasks.get(id)).filter((t): t is TaskEntity => t !== undefined);
  }

  async findByAssignee(assigneeId: string): Promise<TaskEntity[]> {
    const taskIds = this.assigneeIndex.get(assigneeId) || new Set();
    return Array.from(taskIds).map(id => this.tasks.get(id)).filter((t): t is TaskEntity => t !== undefined);
  }

  async findWithFilter(filter: TaskFilter): Promise<TaskEntity[]> {
    let tasks = Array.from(this.tasks.values());
    if (filter.status && filter.status.length > 0) {
      tasks = tasks.filter(t => filter.status!.includes(t.status));
    }
    if (filter.priority && filter.priority.length > 0) {
      tasks = tasks.filter(t => filter.priority!.includes(t.priority));
    }
    if (filter.assigneeId) {
      tasks = tasks.filter(t => t.assigneeId === filter.assigneeId);
    }
    if (filter.projectId) {
      tasks = tasks.filter(t => t.projectId === filter.projectId);
    }
    if (filter.tags && filter.tags.length > 0) {
      tasks = tasks.filter(t => filter.tags!.some(tag => t.tags.includes(tag)));
    }
    if (filter.search) {
      const search = filter.search.toLowerCase();
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(search) || t.description.toLowerCase().includes(search)
      );
    }
    if (filter.dueBefore) {
      tasks = tasks.filter(t => t.dueDate && t.dueDate <= filter.dueBefore!);
    }
    if (filter.dueAfter) {
      tasks = tasks.filter(t => t.dueDate && t.dueDate >= filter.dueAfter!);
    }
    return tasks;
  }

  async create(data: Omit<TaskEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskEntity> {
    const id = this.generateId();
    const now = new Date();
    const task: TaskEntity = { ...data, id, createdAt: now, updatedAt: now };
    this.tasks.set(id, task);
    if (!this.projectIndex.has(data.projectId)) {
      this.projectIndex.set(data.projectId, new Set());
    }
    this.projectIndex.get(data.projectId)!.add(id);
    if (data.assigneeId) {
      if (!this.assigneeIndex.has(data.assigneeId)) {
        this.assigneeIndex.set(data.assigneeId, new Set());
      }
      this.assigneeIndex.get(data.assigneeId)!.add(id);
    }
    return task;
  }

  async update(id: string, data: Partial<TaskEntity>): Promise<TaskEntity | null> {
    const task = this.tasks.get(id);
    if (!task) return null;
    const updated = { ...task, ...data, updatedAt: new Date() };
    this.tasks.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (!task) return false;
    this.tasks.delete(id);
    this.projectIndex.get(task.projectId)?.delete(id);
    if (task.assigneeId) {
      this.assigneeIndex.get(task.assigneeId)?.delete(id);
    }
    return true;
  }

  async count(options: CountOptions = {}): Promise<number> {
    return this.tasks.size;
  }

  async getOverdueTasks(): Promise<TaskEntity[]> {
    const now = new Date();
    return Array.from(this.tasks.values()).filter(
      t => t.dueDate && t.dueDate < now && t.status !== 'done' && t.status !== 'cancelled'
    );
  }

  async getTaskMetrics(projectId: string): Promise<{
    total: number;
    completed: number;
    overdue: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
  }> {
    const tasks = await this.findByProject(projectId);
    const now = new Date();
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'done').length,
      overdue: tasks.filter(t => t.dueDate && t.dueDate < now && t.status !== 'done').length,
      byStatus: tasks.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {} as Record<string, number>),
      byPriority: tasks.reduce((acc, t) => { acc[t.priority] = (acc[t.priority] || 0) + 1; return acc; }, {} as Record<string, number>),
    };
  }
}
