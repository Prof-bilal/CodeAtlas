export type FileStatus40 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type FilePriority40 = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
export interface FileRecord40 {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  status: FileStatus40;
  priority: FilePriority40;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
export interface CreateFilePayload40 {
  name: string;
  description?: string;
  status?: FileStatus40;
  priority?: FilePriority40;
  tags?: string[];
}
export interface UpdateFilePayload40 {
  name?: string;
  description?: string;
  status?: FileStatus40;
  priority?: FilePriority40;
}
export interface FileListResponse40 {
  data: FileRecord40[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface FileContext40 {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}