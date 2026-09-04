export interface Transaction<T = unknown> {
  id: string;
  status: 'pending' | 'committed' | 'rolled_back';
  operations: TransactionOperation[];
  createdAt: Date;
  completedAt?: Date;
}

export interface TransactionOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  entityId?: string;
  data?: unknown;
  rollback?: () => Promise<void>;
}

export class TransactionManager {
  private transactions: Map<string, Transaction> = new Map();
  private activeTransaction: string | null = null;

  beginTransaction(): string {
    const id = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const transaction: Transaction = {
      id,
      status: 'pending',
      operations: [],
      createdAt: new Date(),
    };
    this.transactions.set(id, transaction);
    this.activeTransaction = id;
    return id;
  }

  addOperation(operation: Omit<TransactionOperation, 'id'>): void {
    if (!this.activeTransaction) throw new Error('No active transaction');
    const transaction = this.transactions.get(this.activeTransaction);
    if (!transaction) throw new Error('Transaction not found');
    transaction.operations.push({
      ...operation,
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    });
  }

  async commit(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) throw new Error('Transaction not found');
    if (transaction.status !== 'pending') throw new Error('Transaction is not pending');
    try {
      transaction.status = 'committed';
      transaction.completedAt = new Date();
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }

  async rollback(transactionId: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const ops = [...transaction.operations].reverse();
    for (const op of ops) {
      if (op.rollback) {
        await op.rollback();
      }
    }
    transaction.status = 'rolled_back';
    transaction.completedAt = new Date();
  }

  getTransaction(id: string): Transaction | undefined {
    return this.transactions.get(id);
  }

  getActiveTransaction(): Transaction | undefined {
    if (!this.activeTransaction) return undefined;
    return this.transactions.get(this.activeTransaction);
  }

  cleanup(): number {
    let count = 0;
    for (const [id, txn] of this.transactions.entries()) {
      if (txn.status !== 'pending') {
        this.transactions.delete(id);
        count++;
      }
    }
    return count;
  }

  getStats() {
    return {
      total: this.transactions.size,
      pending: Array.from(this.transactions.values()).filter(t => t.status === 'pending').length,
      committed: Array.from(this.transactions.values()).filter(t => t.status === 'committed').length,
      rolledBack: Array.from(this.transactions.values()).filter(t => t.status === 'rolled_back').length,
    };
  }
}

export function createTransactionManager(): TransactionManager {
  return new TransactionManager();
}
