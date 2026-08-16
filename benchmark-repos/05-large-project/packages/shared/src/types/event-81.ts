export interface EventData81 {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateEventRequest81 {
  name: string;
  description?: string;
  status?: 'active' | 'inactive';
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateEventRequest81 {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
}

export interface EventFilter81 {
  search?: string;
  status?: string[];
  priority?: string[];
  tags?: string[];
  createdFrom?: Date;
  createdTo?: Date;
}

export type EventSortField81 = 'name' | 'status' | 'priority' | 'createdAt' | 'updatedAt';

export interface EventListOptions81 {
  page?: number;
  limit?: number;
  sort?: EventSortField81;
  order?: 'asc' | 'desc';
  filter?: EventFilter81;
}

export interface EventStats81 {
  total: number;
  active: number;
  inactive: number;
  archived: number;
  byPriority: Record<string, number>;
  averageAge: number;
  lastUpdated: Date;
}