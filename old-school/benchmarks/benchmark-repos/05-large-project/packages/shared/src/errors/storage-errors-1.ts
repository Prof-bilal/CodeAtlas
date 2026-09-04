export class StorageError1 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'StorageError1';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class StorageNotFoundError1 extends StorageError1 {
  constructor(id: string) { super('Storage not found: ' + id, 'STORAGE_NOT_FOUND', 404, { id }); }
}

export class StorageValidationError1 extends StorageError1 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'STORAGE_VALIDATION_ERROR', 422, { fields }); }
}

export class StorageConflictError1 extends StorageError1 {
  constructor(message: string) { super(message, 'STORAGE_CONFLICT', 409); }
}

export class StorageUnauthorizedError1 extends StorageError1 {
  constructor(message = 'Unauthorized') { super(message, 'STORAGE_UNAUTHORIZED', 401); }
}

export class StorageRateLimitError1 extends StorageError1 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'STORAGE_RATE_LIMIT', 429, { retryAfter }); }
}
