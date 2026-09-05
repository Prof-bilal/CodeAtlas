export interface Validator<T> {
  validate(value: T): { valid: boolean; errors: string[] };
}

export class Schema<T> {
  private validators: Validator<any>[] = [];

  add(validator: Validator<any>): this {
    this.validators.push(validator);
    return this;
  }

  validate(value: T): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const validator of this.validators) {
      const result = validator.validate(value);
      if (!result.valid) {
        errors.push(...result.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export class StringValidator implements Validator<string> {
  private options: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    required?: boolean;
  } = {};

  constructor(options: typeof this.options = {}) {
    this.options = options;
  }

  validate(value: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.options.required && (!value || value.length === 0)) {
      errors.push('Value is required');
    }

    if (value && this.options.minLength && value.length < this.options.minLength) {
      errors.push(`Minimum length is ${this.options.minLength}`);
    }

    if (value && this.options.maxLength && value.length > this.options.maxLength) {
      errors.push(`Maximum length is ${this.options.maxLength}`);
    }

    if (value && this.options.pattern && !this.options.pattern.test(value)) {
      errors.push('Value does not match required pattern');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export class NumberValidator implements Validator<number> {
  private options: {
    min?: number;
    max?: number;
    integer?: boolean;
    required?: boolean;
  } = {};

  constructor(options: typeof this.options = {}) {
    this.options = options;
  }

  validate(value: number): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.options.required && (value === undefined || value === null)) {
      errors.push('Value is required');
    }

    if (value !== undefined && this.options.min !== undefined && value < this.options.min) {
      errors.push(`Minimum value is ${this.options.min}`);
    }

    if (value !== undefined && this.options.max !== undefined && value > this.options.max) {
      errors.push(`Maximum value is ${this.options.max}`);
    }

    if (value !== undefined && this.options.integer && !Number.isInteger(value)) {
      errors.push('Value must be an integer');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export class ArrayValidator<T> implements Validator<T[]> {
  private options: {
    minLength?: number;
    maxLength?: number;
    itemValidator?: Validator<T>;
    required?: boolean;
  } = {};

  constructor(options: typeof this.options = {}) {
    this.options = options;
  }

  validate(value: T[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.options.required && (!value || value.length === 0)) {
      errors.push('Value is required');
    }

    if (value && this.options.minLength && value.length < this.options.minLength) {
      errors.push(`Minimum length is ${this.options.minLength}`);
    }

    if (value && this.options.maxLength && value.length > this.options.maxLength) {
      errors.push(`Maximum length is ${this.options.maxLength}`);
    }

    if (value && this.options.itemValidator) {
      for (let i = 0; i < value.length; i++) {
        const result = this.options.itemValidator.validate(value[i]);
        if (!result.valid) {
          errors.push(`Item ${i}: ${result.errors.join(', ')}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
