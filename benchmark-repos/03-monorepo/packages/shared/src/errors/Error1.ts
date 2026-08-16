import { AppError } from './AppError.js';

export class Error1 extends AppError {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'ERROR_1', 400 + 1, true);
    this.name = 'Error1';
    this.code = 'ERROR_1';
    this.details = details;
    Object.setPrototypeOf(this, Error1.prototype);
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

  static create(message: string, details?: Record<string, unknown>): Error1 {
    return new Error1(message, details);
  }

  static badRequest(message: string): Error1 {
    return new Error1(message, { type: 'bad_request' });
  }

  static unauthorized(message: string): Error1 {
    return new Error1(message, { type: 'unauthorized' });
  }

  static forbidden(message: string): Error1 {
    return new Error1(message, { type: 'forbidden' });
  }

  static notFound(message: string): Error1 {
    return new Error1(message, { type: 'not_found' });
  }

  static conflict(message: string): Error1 {
    return new Error1(message, { type: 'conflict' });
  }

  static internal(message: string): Error1 {
    return new Error1(message, { type: 'internal' });
  }
}
