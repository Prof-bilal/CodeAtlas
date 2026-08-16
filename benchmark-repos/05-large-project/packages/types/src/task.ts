export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export type TaskType = 'bug' | 'feature' | 'improvement' | 'task' | 'epic' | 'story' | 'spike';
export interface Task { id: string; title: string; description?: string; status: TaskStatus; priority: TaskPriority; type: TaskType; projectId: string; parentId?: string; assigneeId?: string; reporterId: string; labels: string[]; storyPoints?: number; estimatedHours?: number; dueDate?: Date; position: number; createdAt: Date; updatedAt: Date; }
export interface CreateTaskRequest { title: string; description?: string; priority?: TaskPriority; type?: TaskType; projectId: string; assigneeId?: string; labels?: string[]; }
export interface TaskComment { id: string; taskId: string; userId: string; content: string; createdAt: Date; }
export interface TaskDependency { taskId: string; dependsOnId: string; type: 'blocks' | 'blocked_by' | 'relates_to'; }
export interface TaskActivity { id: string; taskId: string; userId: string; action: string; changes: { field: string; oldValue: unknown; newValue: unknown }[]; timestamp: Date; }