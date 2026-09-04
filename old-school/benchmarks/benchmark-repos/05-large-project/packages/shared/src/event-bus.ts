export interface DomainEvent<T = unknown> { eventId: string; eventType: string; aggregateId: string; aggregateType: string; payload: T; metadata: EventMetadata; timestamp: Date; }
export interface EventMetadata { correlationId: string; causationId?: string; userId?: string; organizationId?: string; version: number; source: string; }
type Handler<T = unknown> = (e: DomainEvent<T>) => Promise<void>;
export class EventBus {
  private handlers = new Map<string, Set<Handler>>();
  private dlq: DomainEvent[] = [];
  private metrics = { published: 0, delivered: 0, failed: 0 };
  subscribe<T>(type: string, h: Handler<T>): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    const handler = h as Handler;
    this.handlers.get(type)!.add(handler);
    return () => { this.handlers.get(type)?.delete(handler); };
  }
  async publish(e: DomainEvent): Promise<void> {
    this.metrics.published++;
    const h = this.handlers.get(e.eventType);
    if (!h || h.size === 0) { this.dlq.push(e); return; }
    for (const handler of h) { try { await handler(e); this.metrics.delivered++; } catch { this.metrics.failed++; this.dlq.push(e); } }
  }
  getMetrics() { return { ...this.metrics }; }
  getDLQ() { return [...this.dlq]; }
}