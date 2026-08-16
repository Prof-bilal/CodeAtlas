export class TaskError11 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'TaskError11';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class TaskNotFoundError11 extends TaskError11 {
  constructor(id: string) { super('Task not found: ' + id, 'TASK_NOT_FOUND', 404, { id }); }
}

export class TaskValidationError11 extends TaskError11 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'TASK_VALIDATION_ERROR', 422, { fields }); }
}

export class TaskConflictError11 extends TaskError11 {
  constructor(message: string) { super(message, 'TASK_CONFLICT', 409); }
}

export class TaskUnauthorizedError11 extends TaskError11 {
  constructor(message = 'Unauthorized') { super(message, 'TASK_UNAUTHORIZED', 401); }
}

export class TaskRateLimitError11 extends TaskError11 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'TASK_RATE_LIMIT', 429, { retryAfter }); }
}
