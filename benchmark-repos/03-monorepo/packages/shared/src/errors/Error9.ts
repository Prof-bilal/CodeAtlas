import { AppError } from './AppError.js';

export class Error9 extends AppError {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'ERROR_9', 400 + 9, true);
    this.name = 'Error9';
    this.code = 'ERROR_9';
    this.details = details;
    Object.setPrototypeOf(this, Error9.prototype);
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

  static create(message: string, details?: Record<string, unknown>): Error9 {
    return new Error9(message, details);
  }

  static badRequest(message: string): Error9 {
    return new Error9(message, { type: 'bad_request' });
  }

  static unauthorized(message: string): Error9 {
    return new Error9(message, { type: 'unauthorized' });
  }

  static forbidden(message: string): Error9 {
    return new Error9(message, { type: 'forbidden' });
  }

  static notFound(message: string): Error9 {
    return new Error9(message, { type: 'not_found' });
  }

  static conflict(message: string): Error9 {
    return new Error9(message, { type: 'conflict' });
  }

  static internal(message: string): Error9 {
    return new Error9(message, { type: 'internal' });
  }
}
