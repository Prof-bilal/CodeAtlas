import { AppError } from './AppError.js';

export class Error3 extends AppError {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'ERROR_3', 400 + 3, true);
    this.name = 'Error3';
    this.code = 'ERROR_3';
    this.details = details;
    Object.setPrototypeOf(this, Error3.prototype);
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

  static create(message: string, details?: Record<string, unknown>): Error3 {
    return new Error3(message, details);
  }

  static badRequest(message: string): Error3 {
    return new Error3(message, { type: 'bad_request' });
  }

  static unauthorized(message: string): Error3 {
    return new Error3(message, { type: 'unauthorized' });
  }

  static forbidden(message: string): Error3 {
    return new Error3(message, { type: 'forbidden' });
  }

  static notFound(message: string): Error3 {
    return new Error3(message, { type: 'not_found' });
  }

  static conflict(message: string): Error3 {
    return new Error3(message, { type: 'conflict' });
  }

  static internal(message: string): Error3 {
    return new Error3(message, { type: 'internal' });
  }
}
