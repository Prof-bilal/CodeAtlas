export interface Validator<T> {
  validate(value: T): { valid: boolean; errors: string[] };
}

export function required<T>(validator: Validator<T>): Validator<T> {
  return {
    validate(value: T) {
      if (value === undefined || value === null) {
        return { valid: false, errors: ['Value is required'] };
      }
      return validator.validate(value);
    },
  };
}

export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
  return {
    validate(value: T | undefined) {
      if (value === undefined || value === null) {
        return { valid: true, errors: [] };
      }
      return validator.validate(value);
    },
  };
}

export function compose<T>(...validators: Validator<T>[]): Validator<T> {
  return {
    validate(value: T) {
      const errors: string[] = [];
      
      for (const validator of validators) {
        const result = validator.validate(value);
        if (!result.valid) {
          errors.push(...result.errors);
        }
      }
      
      return {
        valid: errors.length === 0,
        errors,
      };
    },
  };
}

export function custom<T>(fn: (value: T) => boolean, message: string): Validator<T> {
  return {
    validate(value: T) {
      return {
        valid: fn(value),
        errors: fn(value) ? [] : [message],
      };
    },
  };
}
