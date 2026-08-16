export interface AmountValidationResult {
  valid: boolean;
  errors: string[];
}

export interface AmountLimits {
  min: number;
  max: number;
  allowZero: boolean;
}

const DEFAULT_LIMITS: AmountLimits = {
  min: 50,
  max: 99999999,
  allowZero: false,
};

export class AmountValidator {
  private limits: AmountLimits;

  constructor(limits: Partial<AmountLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  validate(amount: number): AmountValidationResult {
    const errors: string[] = [];
    if (typeof amount !== 'number' || isNaN(amount)) {
      errors.push('Amount must be a valid number');
      return { valid: false, errors };
    }
    if (!this.limits.allowZero && amount === 0) {
      errors.push('Amount cannot be zero');
    }
    if (amount < 0) {
      errors.push('Amount cannot be negative');
    }
    if (amount < this.limits.min) {
      errors.push(`Amount must be at least ${this.limits.min}`);
    }
    if (amount > this.limits.max) {
      errors.push(`Amount must be at most ${this.limits.max}`);
    }
    if (!Number.isInteger(amount)) {
      errors.push('Amount must be an integer (in cents)');
    }
    return { valid: errors.length === 0, errors };
  }

  validateCurrency(amount: number, currency: string): AmountValidationResult {
    const baseValidation = this.validate(amount);
    if (!baseValidation.valid) return baseValidation;
    const errors: string[] = [...baseValidation.errors];
    const currencyLimits: Record<string, { min: number; max: number; decimals: number }> = {
      USD: { min: 50, max: 99999999, decimals: 0 },
      EUR: { min: 50, max: 99999999, decimals: 0 },
      GBP: { min: 50, max: 99999999, decimals: 0 },
      JPY: { min: 100, max: 9999999900, decimals: 0 },
    };
    const limits = currencyLimits[currency.toUpperCase()];
    if (!limits) {
      errors.push(`Unsupported currency: ${currency}`);
    } else {
      if (amount < limits.min) {
        errors.push(`Minimum amount for ${currency} is ${limits.min}`);
      }
      if (amount > limits.max) {
        errors.push(`Maximum amount for ${currency} is ${limits.max}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  validatePercentage(percentage: number): AmountValidationResult {
    const errors: string[] = [];
    if (typeof percentage !== 'number' || isNaN(percentage)) {
      errors.push('Percentage must be a valid number');
      return { valid: false, errors };
    }
    if (percentage < 0) {
      errors.push('Percentage cannot be negative');
    }
    if (percentage > 100) {
      errors.push('Percentage cannot exceed 100');
    }
    return { valid: errors.length === 0, errors };
  }

  static isPositive(amount: number): boolean {
    return typeof amount === 'number' && !isNaN(amount) && amount > 0;
  }

  static isNonNegative(amount: number): boolean {
    return typeof amount === 'number' && !isNaN(amount) && amount >= 0;
  }

  static isInteger(amount: number): boolean {
    return Number.isInteger(amount);
  }

  static roundToCents(amount: number): number {
    return Math.round(amount * 100) / 100;
  }
}
