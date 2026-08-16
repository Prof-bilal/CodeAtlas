// Custom error types

export class RateLimitError extends Error {
  constructor(retryAfter: number) {
    super(Rate limited. Retry after ms);
    this.name = 'RateLimitError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
