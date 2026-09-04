// Payment validators

export function validateAmount(amount: number): boolean {
  return amount > 0 && amount <= 1000000;
}

export function validateCurrency(currency: string): boolean {
  return ['usd', 'eur', 'gbp'].includes(currency.toLowerCase());
}
