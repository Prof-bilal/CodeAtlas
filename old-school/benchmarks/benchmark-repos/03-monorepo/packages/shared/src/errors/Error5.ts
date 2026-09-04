import { AppError } from './AppError.js';

export class Error5 extends AppError {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'ERROR_5', 400 + 5, true);
    this.name = 'Error5';
    this.code = 'ERROR_5';
    this.details = details;
    Object.setPrototypeOf(this, Error5.prototype);
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

  static create(message: string, details?: Record<string, unknown>): Error5 {
    return new Error5(message, details);
  }

  static badRequest(message: string): Error5 {
    return new Error5(message, { type: 'bad_request' });
  }

  static unauthorized(message: string): Error5 {
    return new Error5(message, { type: 'unauthorized' });
  }

  static forbidden(message: string): Error5 {
    return new Error5(message, { type: 'forbidden' });
  }

  static notFound(message: string): Error5 {
    return new Error5(message, { type: 'not_found' });
  }

  static conflict(message: string): Error5 {
    return new Error5(message, { type: 'conflict' });
  }

  static internal(message: string): Error5 {
    return new Error5(message, { type: 'internal' });
  }
}
