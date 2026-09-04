export class CacheError23 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CacheError23';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class CacheNotFoundError23 extends CacheError23 {
  constructor(id: string) { super('Cache not found: ' + id, 'CACHE_NOT_FOUND', 404, { id }); }
}

export class CacheValidationError23 extends CacheError23 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'CACHE_VALIDATION_ERROR', 422, { fields }); }
}

export class CacheConflictError23 extends CacheError23 {
  constructor(message: string) { super(message, 'CACHE_CONFLICT', 409); }
}

export class CacheUnauthorizedError23 extends CacheError23 {
  constructor(message = 'Unauthorized') { super(message, 'CACHE_UNAUTHORIZED', 401); }
}

export class CacheRateLimitError23 extends CacheError23 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'CACHE_RATE_LIMIT', 429, { retryAfter }); }
}
