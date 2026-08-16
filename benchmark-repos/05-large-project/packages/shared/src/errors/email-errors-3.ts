export class EmailError3 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EmailError3';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class EmailNotFoundError3 extends EmailError3 {
  constructor(id: string) { super('Email not found: ' + id, 'EMAIL_NOT_FOUND', 404, { id }); }
}

export class EmailValidationError3 extends EmailError3 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'EMAIL_VALIDATION_ERROR', 422, { fields }); }
}

export class EmailConflictError3 extends EmailError3 {
  constructor(message: string) { super(message, 'EMAIL_CONFLICT', 409); }
}

export class EmailUnauthorizedError3 extends EmailError3 {
  constructor(message = 'Unauthorized') { super(message, 'EMAIL_UNAUTHORIZED', 401); }
}

export class EmailRateLimitError3 extends EmailError3 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'EMAIL_RATE_LIMIT', 429, { retryAfter }); }
}
