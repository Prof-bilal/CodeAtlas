export interface ApiResponse<T = unknown> { success: boolean; data?: T; error?: ApiError; meta?: ApiMeta; requestId: string; }
export interface ApiError { code: string; message: string; details?: Record<string, unknown>; validationErrors?: { field: string; message: string; rule: string; }[]; }
export interface ApiMeta { page?: number; limit?: number; total?: number; totalPages?: number; hasNext?: boolean; hasPrev?: boolean; requestId: string; duration: number; }
export interface PaginationQuery { page?: number; limit?: number; sort?: string; order?: 'asc' | 'desc'; }
export interface FilterQuery { search?: string; status?: string[]; tags?: string[]; createdFrom?: string; createdTo?: string; }
export interface BulkOperation<T> { items: T[]; operation: 'create' | 'update' | 'delete'; }
export interface BulkResult<T> { successful: T[]; failed: { item: T; error: ApiError }[]; total: number; }
export interface HealthCheck { status: 'healthy' | 'degraded' | 'unhealthy'; version: string; uptime: number; checks: { name: string; status: 'pass' | 'warn' | 'fail'; duration: number; }[]; }