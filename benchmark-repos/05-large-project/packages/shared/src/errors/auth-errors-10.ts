export class AuthError10 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AuthError10';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class AuthNotFoundError10 extends AuthError10 {
  constructor(id: string) { super('Auth not found: ' + id, 'AUTH_NOT_FOUND', 404, { id }); }
}

export class AuthValidationError10 extends AuthError10 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'AUTH_VALIDATION_ERROR', 422, { fields }); }
}

export class AuthConflictError10 extends AuthError10 {
  constructor(message: string) { super(message, 'AUTH_CONFLICT', 409); }
}

export class AuthUnauthorizedError10 extends AuthError10 {
  constructor(message = 'Unauthorized') { super(message, 'AUTH_UNAUTHORIZED', 401); }
}

export class AuthRateLimitError10 extends AuthError10 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'AUTH_RATE_LIMIT', 429, { retryAfter }); }
}
