import { BaseRepository, BaseEntity, FindOptions, CountOptions } from '../BaseRepository.js';

export interface PaymentEntity extends BaseEntity {
  userId: string;
  amount: number;
  currency: string;
  status: string;
  type: string;
  provider: string;
  providerPaymentId?: string;
  description: string;
  metadata: Record<string, unknown>;
  completedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  refund?: {
    id: string;
    amount: number;
    reason: string;
    status: string;
    providerRefundId?: string;
    createdAt: Date;
    completedAt?: Date;
  };
}

export interface PaymentFilter {
  userId?: string;
  status?: string[];
  type?: string[];
  provider?: string[];
  amountMin?: number;
  amountMax?: number;
  currency?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export class PaymentRepository extends BaseRepository<PaymentEntity> {
  private payments: Map<string, PaymentEntity> = new Map();
  private userIndex: Map<string, Set<string>> = new Map();
  private providerIndex: Map<string, Set<string>> = new Map();

  constructor() {
    super('payments');
  }

  async findById(id: string): Promise<PaymentEntity | null> {
    return this.payments.get(id) || null;
  }

  async findByProviderPaymentId(providerPaymentId: string): Promise<PaymentEntity | null> {
    for (const payment of this.payments.values()) {
      if (payment.providerPaymentId === providerPaymentId) {
        return payment;
      }
    }
    return null;
  }

  async findMany(options: FindOptions = {}): Promise<PaymentEntity[]> {
    let payments = Array.from(this.payments.values());
    if (options.orderBy) {
      const dir = options.orderDirection === 'DESC' ? -1 : 1;
      payments.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[options.orderBy!];
        const bVal = (b as Record<string, unknown>)[options.orderBy!];
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }
    if (options.offset) payments = payments.slice(options.offset);
    if (options.limit) payments = payments.slice(0, options.limit);
    return payments;
  }

  async findByUser(userId: string): Promise<PaymentEntity[]> {
    const paymentIds = this.userIndex.get(userId) || new Set();
    return Array.from(paymentIds)
      .map(id => this.payments.get(id))
      .filter((p): p is PaymentEntity => p !== undefined);
  }

  async findWithFilter(filter: PaymentFilter): Promise<PaymentEntity[]> {
    let payments = Array.from(this.payments.values());
    if (filter.userId) {
      payments = payments.filter(p => p.userId === filter.userId);
    }
    if (filter.status && filter.status.length > 0) {
      payments = payments.filter(p => filter.status!.includes(p.status));
    }
    if (filter.type && filter.type.length > 0) {
      payments = payments.filter(p => filter.type!.includes(p.type));
    }
    if (filter.provider && filter.provider.length > 0) {
      payments = payments.filter(p => filter.provider!.includes(p.provider));
    }
    if (filter.amountMin !== undefined) {
      payments = payments.filter(p => p.amount >= filter.amountMin!);
    }
    if (filter.amountMax !== undefined) {
      payments = payments.filter(p => p.amount <= filter.amountMax!);
    }
    if (filter.currency) {
      payments = payments.filter(p => p.currency === filter.currency);
    }
    if (filter.createdAfter) {
      payments = payments.filter(p => p.createdAt >= filter.createdAfter!);
    }
    if (filter.createdBefore) {
      payments = payments.filter(p => p.createdAt <= filter.createdBefore!);
    }
    return payments;
  }

  async create(data: Omit<PaymentEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentEntity> {
    const id = this.generateId();
    const now = new Date();
    const payment: PaymentEntity = { ...data, id, createdAt: now, updatedAt: now };
    this.payments.set(id, payment);
    if (!this.userIndex.has(data.userId)) {
      this.userIndex.set(data.userId, new Set());
    }
    this.userIndex.get(data.userId)!.add(id);
    if (!this.providerIndex.has(data.provider)) {
      this.providerIndex.set(data.provider, new Set());
    }
    this.providerIndex.get(data.provider)!.add(id);
    return payment;
  }

  async update(id: string, data: Partial<PaymentEntity>): Promise<PaymentEntity | null> {
    const payment = this.payments.get(id);
    if (!payment) return null;
    const updated = { ...payment, ...data, updatedAt: new Date() };
    this.payments.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const payment = this.payments.get(id);
    if (!payment) return false;
    this.payments.delete(id);
    this.userIndex.get(payment.userId)?.delete(id);
    this.providerIndex.get(payment.provider)?.delete(id);
    return true;
  }

  async count(options: CountOptions = {}): Promise<number> {
    return this.payments.size;
  }

  async getTotalByUser(userId: string): Promise<number> {
    const payments = await this.findByUser(userId);
    return payments
      .filter(p => p.status === 'completed' && p.type !== 'refund')
      .reduce((sum, p) => sum + p.amount, 0);
  }

  async getTotalRefundsByUser(userId: string): Promise<number> {
    const payments = await this.findByUser(userId);
    return payments
      .filter(p => p.refund && p.refund.status === 'completed')
      .reduce((sum, p) => sum + (p.refund?.amount || 0), 0);
  }
}
