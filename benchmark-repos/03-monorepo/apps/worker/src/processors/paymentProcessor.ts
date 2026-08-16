export interface PaymentJob {
  id: string;
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
  provider: string;
  action: 'charge' | 'refund' | 'subscription';
  metadata?: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  status: string;
  error?: string;
}

export class PaymentProcessor {
  private processedPayments: Map<string, PaymentResult> = new Map();
  private failedPayments: PaymentJob[] = [];

  async processJob(job: PaymentJob): Promise<PaymentResult> {
    try {
      console.log(`Processing payment ${job.action} for payment ${job.paymentId}`);
      await new Promise(resolve => setTimeout(resolve, 200));
      const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const result: PaymentResult = {
        success: true,
        transactionId,
        status: 'completed',
      };
      this.processedPayments.set(job.paymentId, result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.failedPayments.push(job);
      return { success: false, status: 'failed', error: errorMessage };
    }
  }

  async processCharge(paymentId: string, amount: number, currency: string, provider: string): Promise<PaymentResult> {
    return this.processJob({
      id: `job_${Date.now()}`,
      paymentId,
      userId: '',
      amount,
      currency,
      provider,
      action: 'charge',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
    });
  }

  async processRefund(paymentId: string, amount: number, provider: string): Promise<PaymentResult> {
    return this.processJob({
      id: `job_${Date.now()}`,
      paymentId,
      userId: '',
      amount,
      currency: 'USD',
      provider,
      action: 'refund',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
    });
  }

  getPaymentResult(paymentId: string): PaymentResult | undefined {
    return this.processedPayments.get(paymentId);
  }

  getFailedPayments(): PaymentJob[] {
    return [...this.failedPayments];
  }

  getStats() {
    return {
      processed: this.processedPayments.size,
      failed: this.failedPayments.length,
    };
  }

  async retryFailed(): Promise<PaymentResult[]> {
    const jobs = [...this.failedPayments];
    this.failedPayments = [];
    const results: PaymentResult[] = [];
    for (const job of jobs) {
      results.push(await this.processJob(job));
    }
    return results;
  }
}

export function createPaymentProcessor(): PaymentProcessor {
  return new PaymentProcessor();
}
