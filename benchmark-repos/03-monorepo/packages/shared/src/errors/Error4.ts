import { AppError } from './AppError.js';

export class Error4 extends AppError {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'ERROR_4', 400 + 4, true);
    this.name = 'Error4';
    this.code = 'ERROR_4';
    this.details = details;
    Object.setPrototypeOf(this, Error4.prototype);
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

  static create(message: string, details?: Record<string, unknown>): Error4 {
    return new Error4(message, details);
  }

  static badRequest(message: string): Error4 {
    return new Error4(message, { type: 'bad_request' });
  }

  static unauthorized(message: string): Error4 {
    return new Error4(message, { type: 'unauthorized' });
  }

  static forbidden(message: string): Error4 {
    return new Error4(message, { type: 'forbidden' });
  }

  static notFound(message: string): Error4 {
    return new Error4(message, { type: 'not_found' });
  }

  static conflict(message: string): Error4 {
    return new Error4(message, { type: 'conflict' });
  }

  static internal(message: string): Error4 {
    return new Error4(message, { type: 'internal' });
  }
}
