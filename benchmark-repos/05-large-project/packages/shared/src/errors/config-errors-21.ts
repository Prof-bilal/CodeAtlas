export class ConfigError21 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ConfigError21';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ConfigNotFoundError21 extends ConfigError21 {
  constructor(id: string) { super('Config not found: ' + id, 'CONFIG_NOT_FOUND', 404, { id }); }
}

export class ConfigValidationError21 extends ConfigError21 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'CONFIG_VALIDATION_ERROR', 422, { fields }); }
}

export class ConfigConflictError21 extends ConfigError21 {
  constructor(message: string) { super(message, 'CONFIG_CONFLICT', 409); }
}

export class ConfigUnauthorizedError21 extends ConfigError21 {
  constructor(message = 'Unauthorized') { super(message, 'CONFIG_UNAUTHORIZED', 401); }
}

export class ConfigRateLimitError21 extends ConfigError21 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'CONFIG_RATE_LIMIT', 429, { retryAfter }); }
}
