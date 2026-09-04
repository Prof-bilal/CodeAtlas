export class PushError18 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PushError18';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class PushNotFoundError18 extends PushError18 {
  constructor(id: string) { super('Push not found: ' + id, 'PUSH_NOT_FOUND', 404, { id }); }
}

export class PushValidationError18 extends PushError18 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'PUSH_VALIDATION_ERROR', 422, { fields }); }
}

export class PushConflictError18 extends PushError18 {
  constructor(message: string) { super(message, 'PUSH_CONFLICT', 409); }
}

export class PushUnauthorizedError18 extends PushError18 {
  constructor(message = 'Unauthorized') { super(message, 'PUSH_UNAUTHORIZED', 401); }
}

export class PushRateLimitError18 extends PushError18 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'PUSH_RATE_LIMIT', 429, { retryAfter }); }
}
