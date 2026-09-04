export class AuthError7 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AuthError7';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class AuthNotFoundError7 extends AuthError7 {
  constructor(id: string) { super('Auth not found: ' + id, 'AUTH_NOT_FOUND', 404, { id }); }
}

export class AuthValidationError7 extends AuthError7 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'AUTH_VALIDATION_ERROR', 422, { fields }); }
}

export class AuthConflictError7 extends AuthError7 {
  constructor(message: string) { super(message, 'AUTH_CONFLICT', 409); }
}

export class AuthUnauthorizedError7 extends AuthError7 {
  constructor(message = 'Unauthorized') { super(message, 'AUTH_UNAUTHORIZED', 401); }
}

export class AuthRateLimitError7 extends AuthError7 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'AUTH_RATE_LIMIT', 429, { retryAfter }); }
}
