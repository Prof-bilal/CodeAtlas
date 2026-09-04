import { AppError } from './AppError.js';

export class Error6 extends AppError {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'ERROR_6', 400 + 6, true);
    this.name = 'Error6';
    this.code = 'ERROR_6';
    this.details = details;
    Object.setPrototypeOf(this, Error6.prototype);
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

  static create(message: string, details?: Record<string, unknown>): Error6 {
    return new Error6(message, details);
  }

  static badRequest(message: string): Error6 {
    return new Error6(message, { type: 'bad_request' });
  }

  static unauthorized(message: string): Error6 {
    return new Error6(message, { type: 'unauthorized' });
  }

  static forbidden(message: string): Error6 {
    return new Error6(message, { type: 'forbidden' });
  }

  static notFound(message: string): Error6 {
    return new Error6(message, { type: 'not_found' });
  }

  static conflict(message: string): Error6 {
    return new Error6(message, { type: 'conflict' });
  }

  static internal(message: string): Error6 {
    return new Error6(message, { type: 'internal' });
  }
}
