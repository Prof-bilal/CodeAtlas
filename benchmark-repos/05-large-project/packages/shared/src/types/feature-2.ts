export interface FeatureData2 {
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

export interface CreateFeatureRequest2 {
  name: string;
  description?: string;
  status?: 'active' | 'inactive';
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateFeatureRequest2 {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
}

export interface FeatureFilter2 {
  search?: string;
  status?: string[];
  priority?: string[];
  tags?: string[];
  createdFrom?: Date;
  createdTo?: Date;
}

export type FeatureSortField2 = 'name' | 'status' | 'priority' | 'createdAt' | 'updatedAt';

export interface FeatureListOptions2 {
  page?: number;
  limit?: number;
  sort?: FeatureSortField2;
  order?: 'asc' | 'desc';
  filter?: FeatureFilter2;
}

export interface FeatureStats2 {
  total: number;
  active: number;
  inactive: number;
  archived: number;
  byPriority: Record<string, number>;
  averageAge: number;
  lastUpdated: Date;
}