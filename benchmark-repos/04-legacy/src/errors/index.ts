// Error classes - OLD
// DEPRECATED - use standard Error classes

export class AppError extends Error {
  public code: string;
  public status: number;

  constructor(message: string, code: string, status: number = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(${resource} not found, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_ERROR', 401);
  }
}

// TODO: this is used by old code
export class LegacyError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
