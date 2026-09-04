import { AppError } from './AppError.js';

export class Error7 extends AppError {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'ERROR_7', 400 + 7, true);
    this.name = 'Error7';
    this.code = 'ERROR_7';
    this.details = details;
    Object.setPrototypeOf(this, Error7.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }

  static create(message: string, details?: Record<string, unknown>): Error7 {
    return new Error7(message, details);
  }

  static badRequest(message: string): Error7 {
    return new Error7(message, { type: 'bad_request' });
  }

  static unauthorized(message: string): Error7 {
    return new Error7(message, { type: 'unauthorized' });
  }

  static forbidden(message: string): Error7 {
    return new Error7(message, { type: 'forbidden' });
  }

  static notFound(message: string): Error7 {
    return new Error7(message, { type: 'not_found' });
  }

  static conflict(message: string): Error7 {
    return new Error7(message, { type: 'conflict' });
  }

  static internal(message: string): Error7 {
    return new Error7(message, { type: 'internal' });
  }
}
