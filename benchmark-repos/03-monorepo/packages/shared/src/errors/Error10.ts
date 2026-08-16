import { AppError } from './AppError.js';

export class Error10 extends AppError {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'ERROR_10', 400 + 10, true);
    this.name = 'Error10';
    this.code = 'ERROR_10';
    this.details = details;
    Object.setPrototypeOf(this, Error10.prototype);
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

  static create(message: string, details?: Record<string, unknown>): Error10 {
    return new Error10(message, details);
  }

  static badRequest(message: string): Error10 {
    return new Error10(message, { type: 'bad_request' });
  }

  static unauthorized(message: string): Error10 {
    return new Error10(message, { type: 'unauthorized' });
  }

  static forbidden(message: string): Error10 {
    return new Error10(message, { type: 'forbidden' });
  }

  static notFound(message: string): Error10 {
    return new Error10(message, { type: 'not_found' });
  }

  static conflict(message: string): Error10 {
    return new Error10(message, { type: 'conflict' });
  }

  static internal(message: string): Error10 {
    return new Error10(message, { type: 'internal' });
  }
}
