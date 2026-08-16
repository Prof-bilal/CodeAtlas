export interface RefundRequest {
  paymentId: string;
  amount: number;
  reason: string;
  provider: string;
  metadata?: Record<string, string>;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  status: string;
  error?: string;
}

export interface RefundPolicy {
  maxRefundDays: number;
  allowedStatuses: string[];
  minRefundAmount: number;
  maxRefundPercentage: number;
}

const DEFAULT_REFUND_POLICY: RefundPolicy = {
  maxRefundDays: 30,
  allowedStatuses: ['completed'],
  minRefundAmount: 50,
  maxRefundPercentage: 100,
};

export class RefundProcessor {
  private refundPolicy: RefundPolicy;
  private processedRefunds: Map<string, RefundResult> = new Map();
  private refundHistory: Map<string, Array<{ amount: number; date: Date }>> = new Map();

  constructor(policy: Partial<RefundPolicy> = {}) {
    this.refundPolicy = { ...DEFAULT_REFUND_POLICY, ...policy };
  }

  async processRefund(request: RefundRequest): Promise<RefundResult> {
    const validation = this.validateRefundRequest(request);
    if (!validation.valid) {
      return {
        success: false,
        status: 'failed',
        error: validation.errors.join(', '),
      };
    }
    try {
      const result = await this.executeRefund(request);
      this.processedRefunds.set(request.paymentId, result);
      if (!this.refundHistory.has(request.paymentId)) {
        this.refundHistory.set(request.paymentId, []);
      }
      this.refundHistory.get(request.paymentId)!.push({
        amount: request.amount,
        date: new Date(),
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  private validateRefundRequest(request: RefundRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!request.paymentId) errors.push('Payment ID is required');
    if (!request.amount || request.amount <= 0) errors.push('Refund amount must be positive');
    if (!request.reason) errors.push('Refund reason is required');
    if (request.reason.length > 500) errors.push('Reason must be 500 characters or less');
    return { valid: errors.length === 0, errors };
  }

  private async executeRefund(request: RefundRequest): Promise<RefundResult> {
    await new Promise(resolve => setTimeout(resolve, 100));
    const refundId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return {
      success: true,
      refundId,
      status: 'completed',
    };
  }

  canRefund(paymentId: string, paymentAmount: number, paymentDate: Date): { allowed: boolean; reason?: string } {
    const now = new Date();
    const daysSincePayment = Math.floor((now.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSincePayment > this.refundPolicy.maxRefundDays) {
      return { allowed: false, reason: `Refund window exceeded (${this.refundPolicy.maxRefundDays} days)` };
    }
    const totalRefunded = this.getTotalRefunded(paymentId);
    const remainingRefundable = paymentAmount - totalRefunded;
    if (remainingRefundable <= 0) {
      return { allowed: false, reason: 'Payment has already been fully refunded' };
    }
    return { allowed: true };
  }

  getTotalRefunded(paymentId: string): number {
    const history = this.refundHistory.get(paymentId) || [];
    return history.reduce((sum, refund) => sum + refund.amount, 0);
  }

  getRefundHistory(paymentId: string): Array<{ amount: number; date: Date }> {
    return this.refundHistory.get(paymentId) || [];
  }

  async partialRefund(paymentId: string, amount: number, reason: string, totalAmount: number): Promise<RefundResult> {
    const totalRefunded = this.getTotalRefunded(paymentId);
    if (totalRefunded + amount > totalAmount) {
      return {
        success: false,
        status: 'failed',
        error: 'Refund amount exceeds refundable amount',
      };
    }
    return this.processRefund({
      paymentId,
      amount,
      reason,
      provider: 'stripe',
    });
  }

  async fullRefund(paymentId: string, reason: string, totalAmount: number): Promise<RefundResult> {
    const totalRefunded = this.getTotalRefunded(paymentId);
    const remaining = totalAmount - totalRefunded;
    if (remaining <= 0) {
      return {
        success: false,
        status: 'failed',
        error: 'Payment has already been fully refunded',
      };
    }
    return this.processRefund({
      paymentId,
      amount: remaining,
      reason,
      provider: 'stripe',
    });
  }

  getStats(): {
    totalRefunds: number;
    totalAmount: number;
    averageAmount: number;
  } {
    let totalAmount = 0;
    let count = 0;
    for (const history of this.refundHistory.values()) {
      for (const refund of history) {
        totalAmount += refund.amount;
        count++;
      }
    }
    return {
      totalRefunds: count,
      totalAmount,
      averageAmount: count > 0 ? totalAmount / count : 0,
    };
  }
}
