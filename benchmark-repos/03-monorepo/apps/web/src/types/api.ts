export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

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
}

export interface CreateProjectRequest {
  name: string;
  description: string;
  tags?: string[];
  startDate?: string;
  endDate?: string;
  budget?: number;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: string;
  tags?: string[];
  startDate?: string;
  endDate?: string;
  budget?: number;
}

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: string;
  status: string;
}
