export class SmsError19 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SmsError19';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class SmsNotFoundError19 extends SmsError19 {
  constructor(id: string) { super('Sms not found: ' + id, 'SMS_NOT_FOUND', 404, { id }); }
}

export class SmsValidationError19 extends SmsError19 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'SMS_VALIDATION_ERROR', 422, { fields }); }
}

export class SmsConflictError19 extends SmsError19 {
  constructor(message: string) { super(message, 'SMS_CONFLICT', 409); }
}

export class SmsUnauthorizedError19 extends SmsError19 {
  constructor(message = 'Unauthorized') { super(message, 'SMS_UNAUTHORIZED', 401); }
}

export class SmsRateLimitError19 extends SmsError19 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'SMS_RATE_LIMIT', 429, { retryAfter }); }
}
