export class WebhookError22 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'WebhookError22';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class WebhookNotFoundError22 extends WebhookError22 {
  constructor(id: string) { super('Webhook not found: ' + id, 'WEBHOOK_NOT_FOUND', 404, { id }); }
}

export class WebhookValidationError22 extends WebhookError22 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'WEBHOOK_VALIDATION_ERROR', 422, { fields }); }
}

export class WebhookConflictError22 extends WebhookError22 {
  constructor(message: string) { super(message, 'WEBHOOK_CONFLICT', 409); }
}

export class WebhookUnauthorizedError22 extends WebhookError22 {
  constructor(message = 'Unauthorized') { super(message, 'WEBHOOK_UNAUTHORIZED', 401); }
}

export class WebhookRateLimitError22 extends WebhookError22 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'WEBHOOK_RATE_LIMIT', 429, { retryAfter }); }
}
