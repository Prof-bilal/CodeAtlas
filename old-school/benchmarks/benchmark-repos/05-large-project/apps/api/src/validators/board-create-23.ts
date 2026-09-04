import { Result, Ok, Err } from '@atlas/shared';

interface ValidationSchema23 { [key: string]: { type: string; required?: boolean; minLength?: number; maxLength?: number; pattern?: RegExp; enum?: unknown[]; } }

const schema: ValidationSchema23 = {
  name: { type: 'string', required: true, minLength: 1, maxLength: 255 },
  email: { type: 'string', required: true, pattern: /^[^@]+@[^@]+$/ },
  status: { type: 'string', enum: ['active', 'inactive', 'archived'] },
  priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
};

export function validateBoardCreate23(data: Record<string, unknown>): Result<Record<string, unknown>> {
  const errors: { field: string; message: string }[] = [];
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push({ field, message: field + ' is required' });
      continue;
    }
    if (value !== undefined && value !== null) {
      if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) errors.push({ field, message: 'Too short' });
      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) errors.push({ field, message: 'Too long' });
      if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) errors.push({ field, message: 'Invalid format' });
      if (rules.enum && !rules.enum.includes(value)) errors.push({ field, message: 'Invalid value' });
    }
  }
  if (errors.length > 0) return Err(new Error(JSON.stringify(errors)));
  return Ok(data);
}