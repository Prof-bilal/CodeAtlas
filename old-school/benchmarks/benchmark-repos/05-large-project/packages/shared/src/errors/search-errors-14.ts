export class SearchError14 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SearchError14';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class SearchNotFoundError14 extends SearchError14 {
  constructor(id: string) { super('Search not found: ' + id, 'SEARCH_NOT_FOUND', 404, { id }); }
}

export class SearchValidationError14 extends SearchError14 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'SEARCH_VALIDATION_ERROR', 422, { fields }); }
}

export class SearchConflictError14 extends SearchError14 {
  constructor(message: string) { super(message, 'SEARCH_CONFLICT', 409); }
}

export class SearchUnauthorizedError14 extends SearchError14 {
  constructor(message = 'Unauthorized') { super(message, 'SEARCH_UNAUTHORIZED', 401); }
}

export class SearchRateLimitError14 extends SearchError14 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'SEARCH_RATE_LIMIT', 429, { retryAfter }); }
}
