export class OrganizationError20 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'OrganizationError20';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class OrganizationNotFoundError20 extends OrganizationError20 {
  constructor(id: string) { super('Organization not found: ' + id, 'ORGANIZATION_NOT_FOUND', 404, { id }); }
}

export class OrganizationValidationError20 extends OrganizationError20 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'ORGANIZATION_VALIDATION_ERROR', 422, { fields }); }
}

export class OrganizationConflictError20 extends OrganizationError20 {
  constructor(message: string) { super(message, 'ORGANIZATION_CONFLICT', 409); }
}

export class OrganizationUnauthorizedError20 extends OrganizationError20 {
  constructor(message = 'Unauthorized') { super(message, 'ORGANIZATION_UNAUTHORIZED', 401); }
}

export class OrganizationRateLimitError20 extends OrganizationError20 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'ORGANIZATION_RATE_LIMIT', 429, { retryAfter }); }
}
