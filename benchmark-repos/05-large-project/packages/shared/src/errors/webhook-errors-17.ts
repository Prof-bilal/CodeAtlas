export class WebhookError17 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'WebhookError17';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class WebhookNotFoundError17 extends WebhookError17 {
  constructor(id: string) { super('Webhook not found: ' + id, 'WEBHOOK_NOT_FOUND', 404, { id }); }
}

export class WebhookValidationError17 extends WebhookError17 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'WEBHOOK_VALIDATION_ERROR', 422, { fields }); }
}

export class WebhookConflictError17 extends WebhookError17 {
  constructor(message: string) { super(message, 'WEBHOOK_CONFLICT', 409); }
}

export class WebhookUnauthorizedError17 extends WebhookError17 {
  constructor(message = 'Unauthorized') { super(message, 'WEBHOOK_UNAUTHORIZED', 401); }
}

export class WebhookRateLimitError17 extends WebhookError17 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'WEBHOOK_RATE_LIMIT', 429, { retryAfter }); }
}
