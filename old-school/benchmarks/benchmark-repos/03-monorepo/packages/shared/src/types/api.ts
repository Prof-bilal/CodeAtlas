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
  stack?: string;
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

export interface SearchParams extends PaginationParams {
  q: string;
  fields?: string[];
  filters?: Record<string, unknown>;
}

export interface BulkOperationRequest<T> {
  operations: BulkOperation<T>[];
  continueOnError?: boolean;
}

export interface BulkOperation<T> {
  method: 'create' | 'update' | 'delete';
  id?: string;
  data?: T;
}

export interface BulkOperationResponse {
  successful: number;
  failed: number;
  errors: BulkOperationError[];
}

export interface BulkOperationError {
  index: number;
  code: string;
  message: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  duration: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface RequestId {
  id: string;
  timestamp: Date;
}

export function createSuccessResponse<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return {
    success: true,
    data,
    meta,
    timestamp: new Date().toISOString(),
  };
}

export function createErrorResponse(code: string, message: string, details?: Record<string, unknown>): ApiResponse<never> {
  return {
    success: false,
    error: { code, message, details },
    timestamp: new Date().toISOString(),
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): ApiResponse<T[]> {
  const totalPages = Math.ceil(total / limit);
  return {
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
    timestamp: new Date().toISOString(),
  };
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
