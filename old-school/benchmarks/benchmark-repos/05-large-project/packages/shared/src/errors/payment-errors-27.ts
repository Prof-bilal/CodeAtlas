export class PaymentError27 extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PaymentError27';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class PaymentNotFoundError27 extends PaymentError27 {
  constructor(id: string) { super('Payment not found: ' + id, 'PAYMENT_NOT_FOUND', 404, { id }); }
}

export class PaymentValidationError27 extends PaymentError27 {
  constructor(message: string, fields: Record<string, string[]>) { super(message, 'PAYMENT_VALIDATION_ERROR', 422, { fields }); }
}

export class PaymentConflictError27 extends PaymentError27 {
  constructor(message: string) { super(message, 'PAYMENT_CONFLICT', 409); }
}

export class PaymentUnauthorizedError27 extends PaymentError27 {
  constructor(message = 'Unauthorized') { super(message, 'PAYMENT_UNAUTHORIZED', 401); }
}

export class PaymentRateLimitError27 extends PaymentError27 {
  constructor(retryAfter: number) { super('Rate limit exceeded', 'PAYMENT_RATE_LIMIT', 429, { retryAfter }); }
}
