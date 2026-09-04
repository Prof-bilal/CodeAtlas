export interface QueueMessage<T = unknown> { id: string; type: string; payload: T; priority: number; attempts: number; maxAttempts: number; createdAt: Date; completedAt?: Date; failedAt?: Date; error?: string; }
export interface QueueProducer<T = unknown> { enqueue(type: string, payload: T, opts?: Partial<QueueMessage<T>>): Promise<string>; }
export class InMemoryQueue<T = unknown> implements QueueProducer<T> {
  private queue: QueueMessage<T>[] = [];
  private handlers = new Map<string, (m: QueueMessage<T>) => Promise<void>>();
  private processing = new Set<string>();
  private metrics = { enqueued: 0, processed: 0, failed: 0, retrying: 0 };
  async enqueue(type: string, payload: T, opts?: Partial<QueueMessage<T>>): Promise<string> {
    const id = Math.random().toString(36).substr(2,9);
    this.queue.push({ id, type, payload, priority: opts?.priority??0, attempts: 0, maxAttempts: opts?.maxAttempts??3, createdAt: new Date() });
    this.metrics.enqueued++; this.queue.sort((a,b) => b.priority-a.priority); return id;
  }
  subscribe(type: string, handler: (m: QueueMessage<T>) => Promise<void>): () => void { this.handlers.set(type, handler); return () => this.handlers.delete(type); }
  async process(): Promise<void> {
    while (true) {
      const msg = this.queue.find(m => !this.processing.has(m.id));
      if (!msg) break;
      this.processing.add(msg.id);
      try { const h = this.handlers.get(msg.type); if (h) await h(msg); msg.completedAt = new Date(); this.metrics.processed++; }
      catch (e) { msg.attempts++; if (msg.attempts>=msg.maxAttempts) { msg.failedAt = new Date(); msg.error = (e as Error).message; this.metrics.failed++; } else { this.metrics.retrying++; } }
      finally { this.processing.delete(msg.id); }
    }
  }
  getMetrics() { return { ...this.metrics }; }
}