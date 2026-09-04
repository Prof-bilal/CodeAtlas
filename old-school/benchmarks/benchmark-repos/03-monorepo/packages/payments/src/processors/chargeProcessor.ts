export interface ChargeRequest {
  paymentId: string;
  amount: number;
  currency: string;
  provider: string;
  paymentMethodId: string;
  customerId?: string;
  metadata?: Record<string, string>;
}

export interface ChargeResult {
  success: boolean;
  transactionId?: string;
  status: string;
  error?: string;
  receiptUrl?: string;
}

export interface ChargeValidation {
  valid: boolean;
  errors: string[];
}

export class ChargeProcessor {
  private processedCharges: Map<string, ChargeResult> = new Map();

  async processCharge(request: ChargeRequest): Promise<ChargeResult> {
    const validation = this.validateChargeRequest(request);
    if (!validation.valid) {
      return {
        success: false,
        status: 'failed',
        error: validation.errors.join(', '),
      };
    }
    try {
      const result = await this.executeCharge(request);
      this.processedCharges.set(request.paymentId, result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const result: ChargeResult = {
        success: false,
        status: 'failed',
        error: errorMessage,
      };
      this.processedCharges.set(request.paymentId, result);
      return result;
    }
  }

  private validateChargeRequest(request: ChargeRequest): ChargeValidation {
    const errors: string[] = [];
    if (!request.paymentId) errors.push('Payment ID is required');
    if (!request.amount || request.amount <= 0) errors.push('Amount must be positive');
    if (!request.currency) errors.push('Currency is required');
    if (!request.provider) errors.push('Provider is required');
    if (!request.paymentMethodId) errors.push('Payment method ID is required');
    const allowedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
    if (!allowedCurrencies.includes(request.currency)) {
      errors.push(`Currency must be one of: ${allowedCurrencies.join(', ')}`);
    }
    return { valid: errors.length === 0, errors };
  }

  private async executeCharge(request: ChargeRequest): Promise<ChargeResult> {
    await new Promise(resolve => setTimeout(resolve, 100));
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return {
      success: true,
      transactionId,
      status: 'completed',
      receiptUrl: `https://receipts.example.com/${transactionId}`,
    };
  }

  async retryCharge(paymentId: string, maxRetries: number = 3): Promise<ChargeResult> {
    let lastResult: ChargeResult | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const existing = this.processedCharges.get(paymentId);
      if (existing && existing.success) {
        return existing;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      lastResult = await this.processCharge({
        paymentId,
        amount: 0,
        currency: 'USD',
        provider: 'stripe',
        paymentMethodId: 'pm_retry',
      });
      if (lastResult.success) return lastResult;
    }
    return lastResult || { success: false, status: 'failed', error: 'Max retries exceeded' };
  }

  getChargeResult(paymentId: string): ChargeResult | undefined {
    return this.processedCharges.get(paymentId);
  }

  async cancelCharge(paymentId: string): Promise<boolean> {
    const charge = this.processedCharges.get(paymentId);
    if (!charge) return false;
    if (charge.status === 'completed') return false;
    charge.status = 'cancelled';
    return true;
  }

  getStats(): {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  } {
    const charges = Array.from(this.processedCharges.values());
    const total = charges.length;
    const successful = charges.filter(c => c.success).length;
    return {
      total,
      successful,
      failed: total - successful,
      successRate: total > 0 ? successful / total : 0,
    };
  }
}
