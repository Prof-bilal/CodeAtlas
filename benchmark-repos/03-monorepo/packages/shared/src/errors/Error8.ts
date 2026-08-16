import { AppError } from './AppError.js';

export class Error8 extends AppError {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'ERROR_8', 400 + 8, true);
    this.name = 'Error8';
    this.code = 'ERROR_8';
    this.details = details;
    Object.setPrototypeOf(this, Error8.prototype);
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

  static create(message: string, details?: Record<string, unknown>): Error8 {
    return new Error8(message, details);
  }

  static badRequest(message: string): Error8 {
    return new Error8(message, { type: 'bad_request' });
  }

  static unauthorized(message: string): Error8 {
    return new Error8(message, { type: 'unauthorized' });
  }

  static forbidden(message: string): Error8 {
    return new Error8(message, { type: 'forbidden' });
  }

  static notFound(message: string): Error8 {
    return new Error8(message, { type: 'not_found' });
  }

  static conflict(message: string): Error8 {
    return new Error8(message, { type: 'conflict' });
  }

  static internal(message: string): Error8 {
    return new Error8(message, { type: 'internal' });
  }
}
