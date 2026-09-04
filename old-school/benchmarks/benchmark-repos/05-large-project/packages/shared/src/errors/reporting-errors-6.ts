export class ReportingError6 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ReportingError6';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ReportingNotFoundError6 extends ReportingError6 {
  constructor(id: string) { super('Reporting not found: ' + id, 'REPORTING_NOT_FOUND', 404, { id }); }
}

export class ReportingValidationError6 extends ReportingError6 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'REPORTING_VALIDATION_ERROR', 422, { fields }); }
}

export class ReportingConflictError6 extends ReportingError6 {
  constructor(message: string) { super(message, 'REPORTING_CONFLICT', 409); }
}

export class ReportingUnauthorizedError6 extends ReportingError6 {
  constructor(message = 'Unauthorized') { super(message, 'REPORTING_UNAUTHORIZED', 401); }
}

export class ReportingRateLimitError6 extends ReportingError6 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'REPORTING_RATE_LIMIT', 429, { retryAfter }); }
}
