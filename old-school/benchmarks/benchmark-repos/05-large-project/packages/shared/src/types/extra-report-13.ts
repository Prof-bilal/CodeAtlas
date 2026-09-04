export type ExtraReportStatus13 = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted' | 'suspended' | 'locked' | 'expired';
export type ExtraReportPriority13 = 'low' | 'medium' | 'high' | 'critical' | 'urgent' | 'blocker';
export type ExtraReportType13 = 'feature' | 'bug' | 'improvement' | 'task' | 'epic' | 'story' | 'spike' | 'chore';

export interface ExtraReportRecord13 {
  id: string;
  uuid: string;
  name: string;
  slug: string;
  description?: string;
  longDescription?: string;
  status: ExtraReportStatus13;
  priority: ExtraReportPriority13;
  type: ExtraReportType13;
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

export interface CreateExtraReportPayload13 {
  name: string;
  slug?: string;
  description?: string;
  status?: ExtraReportStatus13;
  priority?: ExtraReportPriority13;
  type?: ExtraReportType13;
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
  schedule?: Partial<ExtraReportRecord13['schedule']>;
}

export interface UpdateExtraReportPayload13 {
  name?: string;
  slug?: string;
  description?: string;
  status?: ExtraReportStatus13;
  priority?: ExtraReportPriority13;
  type?: ExtraReportType13;
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface ExtraReportListResponse13 {
  data: ExtraReportRecord13[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  filters: ExtraReportFilterOptions13;
  sort: { field: string; order: 'asc' | 'desc' };
  meta: {
    requestId: string;
    duration: number;
    cached: boolean;
    cacheKey?: string;
  };
}

export interface ExtraReportFilterOptions13 {
  search?: string;
  status?: ExtraReportStatus13[];
  priority?: ExtraReportPriority13[];
  type?: ExtraReportType13[];
  tags?: string[];
  labels?: string[];
  createdBy?: string;
  dateRange?: { from: Date; to: Date };
  priceRange?: { min: number; max: number; currency: string };
  geo?: { lat: number; lng: number; radius: number };
  text?: { query: string; fields: string[] };
}

export interface ExtraReportSortOptions13 {
  field: 'name' | 'status' | 'priority' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'views' | 'likes' | 'revenue';
  order: 'asc' | 'desc';
  nullsPosition?: 'first' | 'last';
}

export interface ExtraReportEvent13 {
  id: string;
  type: 'created' | 'updated' | 'deleted' | 'published' | 'archived' | 'restored' | 'accessed' | 'shared';
  entityId: string;
  userId: string;
  timestamp: Date;
  changes?: { field: string; oldValue: unknown; newValue: unknown }[];
  metadata: Record<string, unknown>;
}

export interface ExtraReportHook13 {
  id: string;
  name: string;
  type: 'before' | 'after';
  event: string;
  handler: (event: ExtraReportEvent13) => Promise<void>;
  enabled: boolean;
  priority: number;
  retryCount: number;
  timeout: number;
}

export type ExtraReportMiddleware13 = (ctx: {
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

export interface ExtraReportCacheConfig13 {
  enabled: boolean;
  ttl: number;
  strategy: 'lru' | 'lfu' | 'fifo' | 'random';
  maxSize: number;
  prefix: string;
  invalidateOn: string[];
  tags: string[];
}

export interface ExtraReportRateLimitConfig13 {
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

export interface ExtraReportMetrics13 {
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

export interface ExtraReportHealthCheck13 {
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

export interface ExtraReportAuditLog13 {
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

export interface ExtraReportSearchIndex13 {
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

export interface ExtraReportExportOptions13 {
  format: 'json' | 'csv' | 'xlsx' | 'pdf' | 'xml';
  fields: string[];
  filters: ExtraReportFilterOptions13;
  sort: ExtraReportSortOptions13;
  limit?: number;
  includeMetadata: boolean;
  includeRelations: boolean;
  compression: boolean;
}

export interface ExtraReportImportOptions13 {
  format: 'json' | 'csv' | 'xlsx';
  mapping: Record<string, string>;
  validation: boolean;
  dryRun: boolean;
  skipDuplicates: boolean;
  batchSize: number;
  onProgress?: (processed: number, total: number) => void;
  onError?: (error: Error, record: unknown) => void;
}

export interface ExtraReportBatchOperation13 {
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