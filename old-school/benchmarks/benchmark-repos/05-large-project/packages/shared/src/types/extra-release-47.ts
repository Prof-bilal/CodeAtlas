export type ExtraReleaseStatus47 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted' | 'suspended' | 'locked' | 'expired';
export type ExtraReleasePriority47 = 'low' | 'medium' | 'high' | 'critical' | 'urgent' | 'blocker';
export type ExtraReleaseType47 = 'feature' | 'bug' | 'improvement' | 'task' | 'epic' | 'story' | 'spike' | 'chore';

export interface ExtraReleaseRecord47 {
  id: string;
  uuid: string;
  name: string;
  slug: string;
  description?: string;
  longDescription?: string;
  status: ExtraReleaseStatus47;
  priority: ExtraReleasePriority47;
  type: ExtraReleaseType47;
  tags: string[];
  labels: string[];
  metadata: Record<string, unknown>;
  config: Record<string, unknown>;
  stats: {
    views: number;
    likes: number;
    shares: number;
    comments: number;
    downloads: number;
    revenue: number;
  };
  permissions: {
    owner: string;
    admins: string[];
    members: string[];
    viewers: string[];
    public: boolean;
  };
  schedule: {
    startDate?: Date;
    endDate?: Date;
    deadline?: Date;
    recurring: boolean;
    cronExpression?: string;
    timezone: string;
  };
  audit: {
    createdBy: string;
    updatedBy: string;
    version: number;
    lastAccessedAt?: Date;
    accessCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  publishedAt?: Date;
  archivedAt?: Date;
}

export interface CreateExtraReleasePayload47 {
  name: string;
  slug?: string;
  description?: string;
  status?: ExtraReleaseStatus47;
  priority?: ExtraReleasePriority47;
  type?: ExtraReleaseType47;
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
  schedule?: Partial<ExtraReleaseRecord47['schedule']>;
}

export interface UpdateExtraReleasePayload47 {
  name?: string;
  slug?: string;
  description?: string;
  status?: ExtraReleaseStatus47;
  priority?: ExtraReleasePriority47;
  type?: ExtraReleaseType47;
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface ExtraReleaseListResponse47 {
  data: ExtraReleaseRecord47[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  filters: ExtraReleaseFilterOptions47;
  sort: { field: string; order: 'asc' | 'desc' };
  meta: {
    requestId: string;
    duration: number;
    cached: boolean;
    cacheKey?: string;
  };
}

export interface ExtraReleaseFilterOptions47 {
  search?: string;
  status?: ExtraReleaseStatus47[];
  priority?: ExtraReleasePriority47[];
  type?: ExtraReleaseType47[];
  tags?: string[];
  labels?: string[];
  createdBy?: string;
  dateRange?: { from: Date; to: Date };
  priceRange?: { min: number; max: number; currency: string };
  geo?: { lat: number; lng: number; radius: number };
  text?: { query: string; fields: string[] };
}

export interface ExtraReleaseSortOptions47 {
  field: 'name' | 'status' | 'priority' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'views' | 'likes' | 'revenue';
  order: 'asc' | 'desc';
  nullsPosition?: 'first' | 'last';
}

export interface ExtraReleaseEvent47 {
  id: string;
  type: 'created' | 'updated' | 'deleted' | 'published' | 'archived' | 'restored' | 'accessed' | 'shared';
  entityId: string;
  userId: string;
  timestamp: Date;
  changes?: { field: string; oldValue: unknown; newValue: unknown }[];
  metadata: Record<string, unknown>;
}

export interface ExtraReleaseHook47 {
  id: string;
  name: string;
  type: 'before' | 'after';
  event: string;
  handler: (event: ExtraReleaseEvent47) => Promise<void>;
  enabled: boolean;
  priority: number;
  retryCount: number;
  timeout: number;
}

export type ExtraReleaseMiddleware47 = (ctx: {
  requestId: string;
  userId?: string;
  organizationId?: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  setHeader: (key: string, value: string) => void;
  getHeader: (key: string) => string | undefined;
  abort: (status: number, message: string) => void;
  next: () => Promise<void>;
}) => Promise<void>;

export interface ExtraReleaseCacheConfig47 {
  enabled: boolean;
  ttl: number;
  strategy: 'lru' | 'lfu' | 'fifo' | 'random';
  maxSize: number;
  prefix: string;
  invalidateOn: string[];
  tags: string[];
}

export interface ExtraReleaseRateLimitConfig47 {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
  keyGenerator: (ctx: { userId?: string; ip: string }) => string;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  message: string;
  statusCode: number;
  headers: boolean;
}

export interface ExtraReleaseMetrics47 {
  requests: number;
  errors: number;
  avgDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  throughput: number;
  errorRate: number;
  cacheHitRate: number;
  lastResetAt: Date;
}

export interface ExtraReleaseHealthCheck47 {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message?: string;
    duration: number;
    timestamp: Date;
  }[];
  uptime: number;
  version: string;
  timestamp: Date;
}

export interface ExtraReleaseAuditLog47 {
  id: string;
  entityId: string;
  action: string;
  userId: string;
  userName: string;
  changes: { field: string; oldValue: unknown; newValue: unknown }[];
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface ExtraReleaseSearchIndex47 {
  id: string;
  entityId: string;
  document: Record<string, unknown>;
  boost: number;
  suggestions: string[];
  synonyms: string[];
  stopWords: string[];
  analyzedAt: Date;
  expiresAt?: Date;
}

export interface ExtraReleaseExportOptions47 {
  format: 'json' | 'csv' | 'xlsx' | 'pdf' | 'xml';
  fields: string[];
  filters: ExtraReleaseFilterOptions47;
  sort: ExtraReleaseSortOptions47;
  limit?: number;
  includeMetadata: boolean;
  includeRelations: boolean;
  compression: boolean;
}

export interface ExtraReleaseImportOptions47 {
  format: 'json' | 'csv' | 'xlsx';
  mapping: Record<string, string>;
  validation: boolean;
  dryRun: boolean;
  skipDuplicates: boolean;
  batchSize: number;
  onProgress?: (processed: number, total: number) => void;
  onError?: (error: Error, record: unknown) => void;
}

export interface ExtraReleaseBatchOperation47 {
  id: string;
  operation: 'create' | 'update' | 'delete' | 'archive' | 'restore' | 'publish' | 'unpublish';
  items: unknown[];
  options: {
    dryRun: boolean;
    continueOnError: boolean;
    maxRetries: number;
    timeout: number;
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    total: number;
    processed: number;
    successful: number;
    failed: number;
    percentage: number;
  };
  result?: {
    successful: unknown[];
    failed: { item: unknown; error: string }[];
    duration: number;
  };
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}