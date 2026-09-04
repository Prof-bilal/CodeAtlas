import { AppError } from './AppError.js';

export class Error2 extends AppError {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'ERROR_2', 400 + 2, true);
    this.name = 'Error2';
    this.code = 'ERROR_2';
    this.details = details;
    Object.setPrototypeOf(this, Error2.prototype);
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

  static create(message: string, details?: Record<string, unknown>): Error2 {
    return new Error2(message, details);
  }

  static badRequest(message: string): Error2 {
    return new Error2(message, { type: 'bad_request' });
  }

  static unauthorized(message: string): Error2 {
    return new Error2(message, { type: 'unauthorized' });
  }

  static forbidden(message: string): Error2 {
    return new Error2(message, { type: 'forbidden' });
  }

  static notFound(message: string): Error2 {
    return new Error2(message, { type: 'not_found' });
  }

  static conflict(message: string): Error2 {
    return new Error2(message, { type: 'conflict' });
  }

  static internal(message: string): Error2 {
    return new Error2(message, { type: 'internal' });
  }
}
