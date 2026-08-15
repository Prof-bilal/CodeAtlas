import type { PaymentRequest } from "./payment-model";

export class PaymentValidator {
  public validatePayment(request: PaymentRequest): string[] {
    const problems: string[] = [];
    if (request.amount <= 0) {
      problems.push("amount must be positive");
    }
    if (request.amount > 5000) {
      problems.push("amount exceeds limit");
    }
    if (request.currency !== "USD") {
      problems.push("unsupported currency");
    }
    return problems;
  }
}

export function validatePayment(request: PaymentRequest): boolean {
  return new PaymentValidator().validatePayment(request).length === 0;
}
