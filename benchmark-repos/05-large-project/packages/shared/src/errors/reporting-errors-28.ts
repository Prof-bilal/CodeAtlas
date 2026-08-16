export class ReportingError28 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ReportingError28';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ReportingNotFoundError28 extends ReportingError28 {
  constructor(id: string) { super('Reporting not found: ' + id, 'REPORTING_NOT_FOUND', 404, { id }); }
}

export class ReportingValidationError28 extends ReportingError28 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'REPORTING_VALIDATION_ERROR', 422, { fields }); }
}

export class ReportingConflictError28 extends ReportingError28 {
  constructor(message: string) { super(message, 'REPORTING_CONFLICT', 409); }
}

export class ReportingUnauthorizedError28 extends ReportingError28 {
  constructor(message = 'Unauthorized') { super(message, 'REPORTING_UNAUTHORIZED', 401); }
}

export class ReportingRateLimitError28 extends ReportingError28 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'REPORTING_RATE_LIMIT', 429, { retryAfter }); }
}
