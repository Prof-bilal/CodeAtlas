export interface FeatureData143 {
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

export interface CreateFeatureRequest143 {
  name: string;
  description?: string;
  status?: 'active' | 'inactive';
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateFeatureRequest143 {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
}

export interface FeatureFilter143 {
  search?: string;
  status?: string[];
  priority?: string[];
  tags?: string[];
  createdFrom?: Date;
  createdTo?: Date;
}

export type FeatureSortField143 = 'name' | 'status' | 'priority' | 'createdAt' | 'updatedAt';

export interface FeatureListOptions143 {
  page?: number;
  limit?: number;
  sort?: FeatureSortField143;
  order?: 'asc' | 'desc';
  filter?: FeatureFilter143;
}

export interface FeatureStats143 {
  total: number;
  active: number;
  inactive: number;
  archived: number;
  byPriority: Record<string, number>;
  averageAge: number;
  lastUpdated: Date;
}