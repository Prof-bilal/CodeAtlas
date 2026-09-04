export interface CreateTaskRequest {
  title: string;
  description: string;
  projectId: string;
  priority?: string;
  assigneeId?: string;
  tags?: string[];
  dueDate?: string;
  estimatedHours?: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  tags?: string[];
  dueDate?: string;
  actualHours?: number;
}

export interface TaskResponse {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId?: string;
  projectId: string;
  tags: string[];
  dueDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export class TaskController {
  private tasks: Map<string, TaskResponse> = new Map();

  async getTasks(filters?: { projectId?: string; status?: string; assigneeId?: string }): Promise<TaskResponse[]> {
    let tasks = Array.from(this.tasks.values());
    if (filters?.projectId) tasks = tasks.filter(t => t.projectId === filters.projectId);
    if (filters?.status) tasks = tasks.filter(t => t.status === filters.status);
    if (filters?.assigneeId) tasks = tasks.filter(t => t.assigneeId === filters.assigneeId);
    return tasks;
  }

  async getTask(id: string): Promise<TaskResponse> {
    const task = this.tasks.get(id);
    if (!task) throw new Error('Task not found');
    return task;
  }

  async createTask(request: CreateTaskRequest, userId: string): Promise<TaskResponse> {
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const task: TaskResponse = {
      id,
      title: request.title,
      description: request.description,
      status: 'todo',
      priority: request.priority || 'medium',
      assigneeId: request.assigneeId,
      projectId: request.projectId,
      tags: request.tags || [],
      dueDate: request.dueDate,
      estimatedHours: request.estimatedHours,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    return task;
  }

  async updateTask(id: string, request: UpdateTaskRequest): Promise<TaskResponse> {
    const task = this.tasks.get(id);
    if (!task) throw new Error('Task not found');
    const updated = { ...task, ...request, updatedAt: new Date().toISOString() };
    this.tasks.set(id, updated);
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    if (!this.tasks.has(id)) throw new Error('Task not found');
    this.tasks.delete(id);
  }

  async getOverdueTasks(): Promise<TaskResponse[]> {
    const now = new Date();
    return Array.from(this.tasks.values()).filter(
      t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done' && t.status !== 'cancelled'
    );
  }

  async bulkUpdate(ids: string[], updates: Partial<UpdateTaskRequest>): Promise<TaskResponse[]> {
    const results: TaskResponse[] = [];
    for (const id of ids) {
      const task = this.tasks.get(id);
      if (task) {
        const updated = { ...task, ...updates, updatedAt: new Date().toISOString() };
        this.tasks.set(id, updated);
        results.push(updated);
      }
    }
    return results;
  }

  async searchTasks(query: string): Promise<TaskResponse[]> {
    const lower = query.toLowerCase();
    return Array.from(this.tasks.values()).filter(
      t => t.title.toLowerCase().includes(lower) || t.description.toLowerCase().includes(lower)
    );
  }
}

export function createTaskController(): TaskController {
  return new TaskController();
}
