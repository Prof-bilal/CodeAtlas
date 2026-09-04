export class SchedulerError13 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SchedulerError13';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class SchedulerNotFoundError13 extends SchedulerError13 {
  constructor(id: string) { super('Scheduler not found: ' + id, 'SCHEDULER_NOT_FOUND', 404, { id }); }
}

export class SchedulerValidationError13 extends SchedulerError13 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'SCHEDULER_VALIDATION_ERROR', 422, { fields }); }
}

export class SchedulerConflictError13 extends SchedulerError13 {
  constructor(message: string) { super(message, 'SCHEDULER_CONFLICT', 409); }
}

export class SchedulerUnauthorizedError13 extends SchedulerError13 {
  constructor(message = 'Unauthorized') { super(message, 'SCHEDULER_UNAUTHORIZED', 401); }
}

export class SchedulerRateLimitError13 extends SchedulerError13 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'SCHEDULER_RATE_LIMIT', 429, { retryAfter }); }
}
