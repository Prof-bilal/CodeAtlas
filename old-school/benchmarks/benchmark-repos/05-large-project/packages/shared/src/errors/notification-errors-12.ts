export class NotificationError12 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'NotificationError12';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotificationNotFoundError12 extends NotificationError12 {
  constructor(id: string) { super('Notification not found: ' + id, 'NOTIFICATION_NOT_FOUND', 404, { id }); }
}

export class NotificationValidationError12 extends NotificationError12 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'NOTIFICATION_VALIDATION_ERROR', 422, { fields }); }
}

export class NotificationConflictError12 extends NotificationError12 {
  constructor(message: string) { super(message, 'NOTIFICATION_CONFLICT', 409); }
}

export class NotificationUnauthorizedError12 extends NotificationError12 {
  constructor(message = 'Unauthorized') { super(message, 'NOTIFICATION_UNAUTHORIZED', 401); }
}

export class NotificationRateLimitError12 extends NotificationError12 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'NOTIFICATION_RATE_LIMIT', 429, { retryAfter }); }
}
