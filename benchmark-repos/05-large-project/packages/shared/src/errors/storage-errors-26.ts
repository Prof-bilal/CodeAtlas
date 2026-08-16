export class StorageError26 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'StorageError26';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class StorageNotFoundError26 extends StorageError26 {
  constructor(id: string) { super('Storage not found: ' + id, 'STORAGE_NOT_FOUND', 404, { id }); }
}

export class StorageValidationError26 extends StorageError26 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'STORAGE_VALIDATION_ERROR', 422, { fields }); }
}

export class StorageConflictError26 extends StorageError26 {
  constructor(message: string) { super(message, 'STORAGE_CONFLICT', 409); }
}

export class StorageUnauthorizedError26 extends StorageError26 {
  constructor(message = 'Unauthorized') { super(message, 'STORAGE_UNAUTHORIZED', 401); }
}

export class StorageRateLimitError26 extends StorageError26 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'STORAGE_RATE_LIMIT', 429, { retryAfter }); }
}
