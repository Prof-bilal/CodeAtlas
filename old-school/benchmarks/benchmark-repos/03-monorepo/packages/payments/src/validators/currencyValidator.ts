export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  minAmount: number;
  maxAmount: number;
}

export interface CurrencyValidationResult {
  valid: boolean;
  errors: string[];
}

const SUPPORTED_CURRENCIES: Record<string, CurrencyInfo> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, minAmount: 50, maxAmount: 99999999 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, minAmount: 50, maxAmount: 99999999 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2, minAmount: 50, maxAmount: 99999999 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2, minAmount: 50, maxAmount: 99999999 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2, minAmount: 50, maxAmount: 99999999 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0, minAmount: 100, maxAmount: 9999999900 },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2, minAmount: 50, maxAmount: 99999999 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2, minAmount: 100, maxAmount: 99999999 },
};

export class CurrencyValidator {
  private supportedCurrencies: Map<string, CurrencyInfo>;

  constructor(customCurrencies?: Record<string, CurrencyInfo>) {
    this.supportedCurrencies = new Map(
      Object.entries(customCurrencies || SUPPORTED_CURRENCIES)
    );
  }

  validate(currency: string): CurrencyValidationResult {
    const errors: string[] = [];
    if (!currency || typeof currency !== 'string') {
      errors.push('Currency code is required');
      return { valid: false, errors };
    }
    const normalizedCurrency = currency.toUpperCase().trim();
    if (normalizedCurrency !== currency) {
      errors.push('Currency code must be uppercase');
    }
    if (normalizedCurrency.length !== 3) {
      errors.push('Currency code must be 3 characters');
    }
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      errors.push('Currency code must contain only letters');
    }
    if (!this.supportedCurrencies.has(normalizedCurrency)) {
      errors.push(`Unsupported currency: ${normalizedCurrency}`);
    }
    return { valid: errors.length === 0, errors };
  }

  validateAmountForCurrency(currency: string, amount: number): CurrencyValidationResult {
    const currencyValidation = this.validate(currency);
    if (!currencyValidation.valid) return currencyValidation;
    const errors: string[] = [];
    const info = this.supportedCurrencies.get(currency.toUpperCase());
    if (info) {
      if (amount < info.minAmount) {
        errors.push(`Minimum amount for ${currency} is ${info.minAmount}`);
      }
      if (amount > info.maxAmount) {
        errors.push(`Maximum amount for ${currency} is ${info.maxAmount}`);
      }
      const amountStr = amount.toString();
      const decimalIndex = amountStr.indexOf('.');
      if (decimalIndex !== -1) {
        const decimals = amountStr.length - decimalIndex - 1;
        if (decimals > info.decimals) {
          errors.push(`${currency} supports up to ${info.decimals} decimal places`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  getCurrencyInfo(currency: string): CurrencyInfo | undefined {
    return this.supportedCurrencies.get(currency.toUpperCase());
  }

  getSupportedCurrencies(): CurrencyInfo[] {
    return Array.from(this.supportedCurrencies.values());
  }

  isSupported(currency: string): boolean {
    return this.supportedCurrencies.has(currency.toUpperCase());
  }

  formatAmount(amount: number, currency: string): string {
    const info = this.supportedCurrencies.get(currency.toUpperCase());
    if (!info) return `${amount} ${currency}`;
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: info.code,
      minimumFractionDigits: info.decimals,
      maximumFractionDigits: info.decimals,
    });
    return formatter.format(amount / Math.pow(10, info.decimals));
  }

  convertAmount(amount: number, fromCurrency: string, toCurrency: string, rate: number): number {
    const fromInfo = this.supportedCurrencies.get(fromCurrency.toUpperCase());
    const toInfo = this.supportedCurrencies.get(toCurrency.toUpperCase());
    if (!fromInfo || !toInfo) throw new Error('Unsupported currency');
    const baseAmount = amount / Math.pow(10, fromInfo.decimals);
    const converted = baseAmount * rate;
    return Math.round(converted * Math.pow(10, toInfo.decimals));
  }
}
