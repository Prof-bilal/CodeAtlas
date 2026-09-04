export class SecurityError5 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SecurityError5';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class SecurityNotFoundError5 extends SecurityError5 {
  constructor(id: string) { super('Security not found: ' + id, 'SECURITY_NOT_FOUND', 404, { id }); }
}

export class SecurityValidationError5 extends SecurityError5 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'SECURITY_VALIDATION_ERROR', 422, { fields }); }
}

export class SecurityConflictError5 extends SecurityError5 {
  constructor(message: string) { super(message, 'SECURITY_CONFLICT', 409); }
}

export class SecurityUnauthorizedError5 extends SecurityError5 {
  constructor(message = 'Unauthorized') { super(message, 'SECURITY_UNAUTHORIZED', 401); }
}

export class SecurityRateLimitError5 extends SecurityError5 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'SECURITY_RATE_LIMIT', 429, { retryAfter }); }
}
