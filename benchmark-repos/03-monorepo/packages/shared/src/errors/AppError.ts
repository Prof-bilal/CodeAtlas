export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      details: this.details,
      stack: this.stack,
    };
  }

  static fromError(error: Error, code: string = 'INTERNAL_ERROR'): AppError {
    if (error instanceof AppError) return error;
    return new AppError(error.message, code, 500, false);
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, 'BAD_REQUEST', 400, true, details);
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(message, 'UNAUTHORIZED', 401);
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(message, 'FORBIDDEN', 403);
  }

  static notFound(message: string = 'Not found'): AppError {
    return new AppError(message, 'NOT_FOUND', 404);
  }

  static conflict(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, 'CONFLICT', 409, true, details);
  }

  static tooManyRequests(message: string = 'Too many requests'): AppError {
    return new AppError(message, 'RATE_LIMITED', 429);
  }

  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(message, 'INTERNAL_ERROR', 500, false);
  }
}
