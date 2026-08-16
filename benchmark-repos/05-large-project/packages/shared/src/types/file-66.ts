export interface FileData66 {
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

export interface CreateFileRequest66 {
  name: string;
  description?: string;
  status?: 'active' | 'inactive';
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateFileRequest66 {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
}

export interface FileFilter66 {
  search?: string;
  status?: string[];
  priority?: string[];
  tags?: string[];
  createdFrom?: Date;
  createdTo?: Date;
}

export type FileSortField66 = 'name' | 'status' | 'priority' | 'createdAt' | 'updatedAt';

export interface FileListOptions66 {
  page?: number;
  limit?: number;
  sort?: FileSortField66;
  order?: 'asc' | 'desc';
  filter?: FileFilter66;
}

export interface FileStats66 {
  total: number;
  active: number;
  inactive: number;
  archived: number;
  byPriority: Record<string, number>;
  averageAge: number;
  lastUpdated: Date;
}