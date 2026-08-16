import { AppError } from './AppError.js';

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

export class ValidationError extends AppError {
  public readonly errors: ValidationErrorDetail[];

  constructor(message: string, errors: ValidationErrorDetail[] = []) {
    super(message, 'VALIDATION_ERROR', 400, true);
    this.name = 'ValidationError';
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }

  static fromField(field: string, message: string, code: string = 'INVALID', value?: unknown): ValidationError {
    return new ValidationError(`Validation failed for ${field}`, [
      { field, message, code, value },
    ]);
  }

  static required(field: string): ValidationError {
    return ValidationError.fromField(field, `${field} is required`, 'REQUIRED');
  }

  static invalid(field: string, message: string, value?: unknown): ValidationError {
    return ValidationError.fromField(field, message, 'INVALID', value);
  }

  static tooShort(field: string, min: number, value?: unknown): ValidationError {
    return ValidationError.fromField(field, `${field} must be at least ${min} characters`, 'TOO_SHORT', value);
  }

  static tooLong(field: string, max: number, value?: unknown): ValidationError {
    return ValidationError.fromField(field, `${field} must be at most ${max} characters`, 'TOO_LONG', value);
  }

  static outOfRange(field: string, min: number, max: number, value?: unknown): ValidationError {
    return ValidationError.fromField(
      field,
      `${field} must be between ${min} and ${max}`,
      'OUT_OF_RANGE',
      value
    );
  }

  static invalidFormat(field: string, format: string, value?: unknown): ValidationError {
    return ValidationError.fromField(field, `${field} must be a valid ${format}`, 'INVALID_FORMAT', value);
  }

  static invalidEmail(field: string, value?: unknown): ValidationError {
    return ValidationError.invalidFormat(field, 'email address', value);
  }

  static invalidUrl(field: string, value?: unknown): ValidationError {
    return ValidationError.invalidFormat(field, 'URL', value);
  }

  static invalidUuid(field: string, value?: unknown): ValidationError {
    return ValidationError.invalidFormat(field, 'UUID', value);
  }

  static invalidEnum(field: string, allowed: string[], value?: unknown): ValidationError {
    return ValidationError.fromField(
      field,
      `${field} must be one of: ${allowed.join(', ')}`,
      'INVALID_ENUM',
      value
    );
  }

  addError(field: string, message: string, code: string = 'INVALID', value?: unknown): void {
    this.errors.push({ field, message, code, value });
  }

  getErrorCount(): number {
    return this.errors.length;
  }

  getErrorsForField(field: string): ValidationErrorDetail[] {
    return this.errors.filter(e => e.field === field);
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
