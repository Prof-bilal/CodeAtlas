export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

export interface FileMetadata {
  id: string;
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileUploadOptions {
  maxSize?: number;
  allowedMimeTypes?: string[];
  destination?: string;
}

export interface FileListOptions {
  userId?: string;
  mimeType?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'size' | 'filename';
  sortOrder?: 'asc' | 'desc';
}

export interface FileStats {
  totalFiles: number;
  totalSize: number;
  filesByType: Record<string, number>;
  averageSize: number;
}

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
