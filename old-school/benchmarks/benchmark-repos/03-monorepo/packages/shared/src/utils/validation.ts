export interface SchemaField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: unknown[];
  custom?: (value: unknown) => string | null;
  fields?: Record<string, SchemaField>;
}

export interface Schema {
  [field: string]: SchemaField;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validate(data: Record<string, unknown>, schema: Schema): ValidationResult {
  const errors: ValidationError[] = [];
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push({ field, message: `${field} is required`, code: 'REQUIRED' });
      continue;
    }
    if (value === undefined || value === null) continue;
    if (rules.type === 'string' && typeof value !== 'string') {
      errors.push({ field, message: `${field} must be a string`, code: 'INVALID_TYPE' });
    } else if (rules.type === 'number' && typeof value !== 'number') {
      errors.push({ field, message: `${field} must be a number`, code: 'INVALID_TYPE' });
    } else if (rules.type === 'boolean' && typeof value !== 'boolean') {
      errors.push({ field, message: `${field} must be a boolean`, code: 'INVALID_TYPE' });
    } else if (rules.type === 'array' && !Array.isArray(value)) {
      errors.push({ field, message: `${field} must be an array`, code: 'INVALID_TYPE' });
    } else if (rules.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      errors.push({ field, message: `${field} must be an object`, code: 'INVALID_TYPE' });
    }
    if (typeof value === 'string') {
      if (rules.min !== undefined && value.length < rules.min) {
        errors.push({ field, message: `${field} must be at least ${rules.min} characters`, code: 'TOO_SHORT' });
      }
      if (rules.max !== undefined && value.length > rules.max) {
        errors.push({ field, message: `${field} must be at most ${rules.max} characters`, code: 'TOO_LONG' });
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push({ field, message: `${field} format is invalid`, code: 'INVALID_FORMAT' });
      }
    }
    if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push({ field, message: `${field} must be at least ${rules.min}`, code: 'TOO_SMALL' });
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push({ field, message: `${field} must be at most ${rules.max}`, code: 'TOO_LARGE' });
      }
    }
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push({ field, message: `${field} must be one of: ${rules.enum.join(', ')}`, code: 'INVALID_ENUM' });
    }
    if (rules.custom) {
      const customError = rules.custom(value);
      if (customError) errors.push({ field, message: customError, code: 'CUSTOM' });
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validatePartial(data: Record<string, unknown>, schema: Schema): ValidationResult {
  const partialSchema: Schema = {};
  for (const [field, rules] of Object.entries(schema)) {
    if (data[field] !== undefined) {
      partialSchema[field] = rules;
    }
  }
  return validate(data, partialSchema);
}
