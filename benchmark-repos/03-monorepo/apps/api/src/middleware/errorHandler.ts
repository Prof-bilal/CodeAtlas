export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  stack?: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
  requestId?: string;
}

export class ErrorHandler {
  private errorHandlers: Map<string, (error: ApiError) => ErrorResponse> = new Map();

  constructor() {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    this.errorHandlers.set('ValidationError', (error) => ({
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
      timestamp: new Date().toISOString(),
    }));
    this.errorHandlers.set('NotFoundError', (error) => ({
      success: false,
      error: { code: error.code, message: error.message },
      timestamp: new Date().toISOString(),
    }));
    this.errorHandlers.set('AuthError', (error) => ({
      success: false,
      error: { code: error.code, message: error.message },
      timestamp: new Date().toISOString(),
    }));
  }

  handleError(error: unknown, requestId?: string): ErrorResponse {
    if (error instanceof Error && 'code' in error) {
      const apiError = error as ApiError;
      const handler = this.errorHandlers.get(apiError.code) || this.defaultHandler;
      const response = handler(apiError);
      if (requestId) response.requestId = requestId;
      return response;
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return {
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
      timestamp: new Date().toISOString(),
      requestId,
    };
  }

  private defaultHandler = (error: ApiError): ErrorResponse => ({
    success: false,
    error: { code: error.code, message: error.message, details: error.details },
    timestamp: new Date().toISOString(),
  });

  registerHandler(code: string, handler: (error: ApiError) => ErrorResponse): void {
    this.errorHandlers.set(code, handler);
  }

  createValidationError(message: string, details?: Record<string, unknown>): ApiError {
    return { code: 'VALIDATION_ERROR', message, statusCode: 400, details };
  }

  createNotFoundError(resource: string): ApiError {
    return { code: 'NOT_FOUND', message: `${resource} not found`, statusCode: 404 };
  }

  createAuthError(message: string = 'Unauthorized'): ApiError {
    return { code: 'UNAUTHORIZED', message, statusCode: 401 };
  }

  createForbiddenError(message: string = 'Forbidden'): ApiError {
    return { code: 'FORBIDDEN', message, statusCode: 403 };
  }

  createConflictError(message: string): ApiError {
    return { code: 'CONFLICT', message, statusCode: 409 };
  }

  createRateLimitError(): ApiError {
    return { code: 'RATE_LIMITED', message: 'Too many requests', statusCode: 429 };
  }

  createInternalError(message: string = 'Internal server error'): ApiError {
    return { code: 'INTERNAL_ERROR', message, statusCode: 500 };
  }
}

export function createErrorHandler(): ErrorHandler {
  return new ErrorHandler();
}
