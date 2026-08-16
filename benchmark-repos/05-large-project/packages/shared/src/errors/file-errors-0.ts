export class FileError0 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'FileError0';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class FileNotFoundError0 extends FileError0 {
  constructor(id: string) { super('File not found: ' + id, 'FILE_NOT_FOUND', 404, { id }); }
}

export class FileValidationError0 extends FileError0 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'FILE_VALIDATION_ERROR', 422, { fields }); }
}

export class FileConflictError0 extends FileError0 {
  constructor(message: string) { super(message, 'FILE_CONFLICT', 409); }
}

export class FileUnauthorizedError0 extends FileError0 {
  constructor(message = 'Unauthorized') { super(message, 'FILE_UNAUTHORIZED', 401); }
}

export class FileRateLimitError0 extends FileError0 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'FILE_RATE_LIMIT', 429, { retryAfter }); }
}
