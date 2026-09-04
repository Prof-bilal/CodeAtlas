export type ProjectStatus = 'active' | 'archived' | 'deleted';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface Project { id: string; name: string; slug: string; description?: string; status: ProjectStatus; priority: ProjectPriority; organizationId: string; ownerId: string; tags: string[]; settings: ProjectSettings; stats: ProjectStats; createdAt: Date; updatedAt: Date; }
export interface ProjectSettings { defaultTaskPriority: ProjectPriority; enableTimeTracking: boolean; enableCustomFields: boolean; enableDependencies: boolean; }
export interface ProjectStats { totalTasks: number; completedTasks: number; overdueTasks: number; totalMembers: number; totalStoryPoints: number; }
export interface CustomField { id: string; name: string; type: 'text' | 'number' | 'date' | 'select' | 'checkbox'; required: boolean; options?: string[]; }
export interface ProjectMember { projectId: string; userId: string; role: string; joinedAt: Date; }