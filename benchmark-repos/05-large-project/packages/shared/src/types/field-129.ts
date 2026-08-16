export interface FieldData129 {
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

export interface CreateFieldRequest129 {
  name: string;
  description?: string;
  status?: 'active' | 'inactive';
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateFieldRequest129 {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
}

export interface FieldFilter129 {
  search?: string;
  status?: string[];
  priority?: string[];
  tags?: string[];
  createdFrom?: Date;
  createdTo?: Date;
}

export type FieldSortField129 = 'name' | 'status' | 'priority' | 'createdAt' | 'updatedAt';

export interface FieldListOptions129 {
  page?: number;
  limit?: number;
  sort?: FieldSortField129;
  order?: 'asc' | 'desc';
  filter?: FieldFilter129;
}

export interface FieldStats129 {
  total: number;
  active: number;
  inactive: number;
  archived: number;
  byPriority: Record<string, number>;
  averageAge: number;
  lastUpdated: Date;
}