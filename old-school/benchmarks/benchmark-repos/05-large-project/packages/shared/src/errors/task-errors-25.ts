export class TaskError25 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'TaskError25';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class TaskNotFoundError25 extends TaskError25 {
  constructor(id: string) { super('Task not found: ' + id, 'TASK_NOT_FOUND', 404, { id }); }
}

export class TaskValidationError25 extends TaskError25 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'TASK_VALIDATION_ERROR', 422, { fields }); }
}

export class TaskConflictError25 extends TaskError25 {
  constructor(message: string) { super(message, 'TASK_CONFLICT', 409); }
}

export class TaskUnauthorizedError25 extends TaskError25 {
  constructor(message = 'Unauthorized') { super(message, 'TASK_UNAUTHORIZED', 401); }
}

export class TaskRateLimitError25 extends TaskError25 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'TASK_RATE_LIMIT', 429, { retryAfter }); }
}
