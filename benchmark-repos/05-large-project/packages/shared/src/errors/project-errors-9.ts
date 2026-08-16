export class ProjectError9 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ProjectError9';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ProjectNotFoundError9 extends ProjectError9 {
  constructor(id: string) { super('Project not found: ' + id, 'PROJECT_NOT_FOUND', 404, { id }); }
}

export class ProjectValidationError9 extends ProjectError9 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'PROJECT_VALIDATION_ERROR', 422, { fields }); }
}

export class ProjectConflictError9 extends ProjectError9 {
  constructor(message: string) { super(message, 'PROJECT_CONFLICT', 409); }
}

export class ProjectUnauthorizedError9 extends ProjectError9 {
  constructor(message = 'Unauthorized') { super(message, 'PROJECT_UNAUTHORIZED', 401); }
}

export class ProjectRateLimitError9 extends ProjectError9 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'PROJECT_RATE_LIMIT', 429, { retryAfter }); }
}
