export class QueueError4 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'QueueError4';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class QueueNotFoundError4 extends QueueError4 {
  constructor(id: string) { super('Queue not found: ' + id, 'QUEUE_NOT_FOUND', 404, { id }); }
}

export class QueueValidationError4 extends QueueError4 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'QUEUE_VALIDATION_ERROR', 422, { fields }); }
}

export class QueueConflictError4 extends QueueError4 {
  constructor(message: string) { super(message, 'QUEUE_CONFLICT', 409); }
}

export class QueueUnauthorizedError4 extends QueueError4 {
  constructor(message = 'Unauthorized') { super(message, 'QUEUE_UNAUTHORIZED', 401); }
}

export class QueueRateLimitError4 extends QueueError4 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'QUEUE_RATE_LIMIT', 429, { retryAfter }); }
}
