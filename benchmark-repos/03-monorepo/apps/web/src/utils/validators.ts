export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  if (!email) errors.push('Email is required');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email format');
  return { valid: errors.length === 0, errors };
}

export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];
  if (!password) errors.push('Password is required');
  else {
    if (password.length < 8) errors.push('Password must be at least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain a number');
  }
  return { valid: errors.length === 0, errors };
}

export function validateRequired(value: string, fieldName: string): ValidationResult {
  if (!value || value.trim() === '') {
    return { valid: false, errors: [`${fieldName} is required`] };
  }
  return { valid: true, errors: [] };
}

export function validateMaxLength(value: string, maxLength: number, fieldName: string): ValidationResult {
  if (value.length > maxLength) {
    return { valid: false, errors: [`${fieldName} must be ${maxLength} characters or less`] };
  }
  return { valid: true, errors: [] };
}

export function validateMinLength(value: string, minLength: number, fieldName: string): ValidationResult {
  if (value.length < minLength) {
    return { valid: false, errors: [`${fieldName} must be at least ${minLength} characters`] };
  }
  return { valid: true, errors: [] };
}

export function validateUrl(url: string): ValidationResult {
  const errors: string[] = [];
  if (url) {
    try { new URL(url); }
    catch { errors.push('Invalid URL format'); }
  }
  return { valid: errors.length === 0, errors };
}

export function validateNumber(value: number, min?: number, max?: number, fieldName: string = 'Value'): ValidationResult {
  const errors: string[] = [];
  if (isNaN(value)) errors.push(`${fieldName} must be a number`);
  else {
    if (min !== undefined && value < min) errors.push(`${fieldName} must be at least ${min}`);
    if (max !== undefined && value > max) errors.push(`${fieldName} must be at most ${max}`);
  }
  return { valid: errors.length === 0, errors };
}

export function combineValidations(...validations: ValidationResult[]): ValidationResult {
  const allErrors = validations.flatMap(v => v.errors);
  return { valid: allErrors.length === 0, errors: allErrors };
}
