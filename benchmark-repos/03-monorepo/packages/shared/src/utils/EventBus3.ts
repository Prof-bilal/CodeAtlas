export interface EventConfig3 {
  name: string;
  maxListeners: number;
  emitTimeout: number;
  captureRejections: boolean;
  wildcard: boolean;
  delimiter: string;
  maxRetries: number;
  retryDelayMs: number;
}
export interface EventPayload3 {
  event: string;
  data: unknown;
  timestamp: Date;
  source: string;
  correlationId: string;
  metadata: Record<string, unknown>;
}
export interface EventSubscription3 {
  id: string;
  event: string;
  handler: (payload: EventPayload3) => Promise<void>;
  priority: number;
  once: boolean;
  filter?: (payload: EventPayload3) => boolean;
  createdAt: Date;
  callCount: number;
}
export interface EventStats3 {
  totalEmitted: number;
  totalDelivered: number;
  totalFailed: number;
  avgDeliveryTimeMs: number;
  activeSubscriptions: number;
  eventsPerSecond: number;
}
export class EventBus3 {
  private config: EventConfig3;
  private subscriptions: Map<string, EventSubscription3[]> = new Map();
  private eventHistory: EventPayload3[] = [];
  private stats: EventStats3;
  constructor(config: EventConfig3) { this.config = config; this.stats = { totalEmitted: 0, totalDelivered: 0, totalFailed: 0, avgDeliveryTimeMs: 0, activeSubscriptions: 0, eventsPerSecond: 0 }; }
  subscribe(event: string, handler: (payload: EventPayload3) => Promise<void>, options: { priority?: number; once?: boolean; filter?: (payload: EventPayload3) => boolean } = {}): string {
    var id = crypto.randomUUID();
    var subscription: EventSubscription3 = { id: id, event: event, handler: handler, priority: options.priority || 0, once: options.once || false, filter: options.filter, createdAt: new Date(), callCount: 0 };
    var subs = this.subscriptions.get(event) || [];
    subs.push(subscription);
    subs.sort(function(a, b) { return b.priority - a.priority; });
    this.subscriptions.set(event, subs);
    this.stats.activeSubscriptions++;
    return id;
  }
  unsubscribe(subscriptionId: string): boolean {
    for (var entry of this.subscriptions.entries()) {
      var event = entry[0];
      var subs = entry[1];
      var idx = subs.findIndex(function(s) { return s.id === subscriptionId; });
      if (idx !== -1) { subs.splice(idx, 1); this.stats.activeSubscriptions--; return true; }
    }
    return false;
  }
  async emit(event: string, data: unknown, source: string = 'unknown'): Promise<void> {
    var payload: EventPayload3 = { event: event, data: data, timestamp: new Date(), source: source, correlationId: crypto.randomUUID(), metadata: {} };
    this.stats.totalEmitted++;
    this.eventHistory.push(payload);
    if (this.eventHistory.length > 10000) this.eventHistory = this.eventHistory.slice(-5000);
    var subs = this.subscriptions.get(event) || [];
    for (var sub of subs) {
      if (sub.filter && !sub.filter(payload)) continue;
      try {
        var start = Date.now();
        await new Promise(function(resolve, reject) {
          var timer = setTimeout(function() { reject(new Error('Delivery timeout')); }, this.config.emitTimeout);
          sub.handler(payload).then(function() { clearTimeout(timer); resolve(undefined); }).catch(function(e) { clearTimeout(timer); reject(e); });
        }.bind(this));
        sub.callCount++;
        this.stats.totalDelivered++;
        var deliveryTime = Date.now() - start;
        this.stats.avgDeliveryTimeMs = (this.stats.avgDeliveryTimeMs + deliveryTime) / 2;
        if (sub.once) this.unsubscribe(sub.id);
      } catch (error) {
        this.stats.totalFailed++;
      }
    }
  }
  async emitBatch(events: Array<{ event: string; data: unknown }>): Promise<void> {
    for (var e of events) await this.emit(e.event, e.data);
  }
  getStats(): EventStats3 { return Object.assign({}, this.stats); }
  getEventHistory(limit: number = 100): EventPayload3[] { return this.eventHistory.slice(-limit); }
  getSubscriptionCount(event?: string): number {
    if (event) return (this.subscriptions.get(event) || []).length;
    var count = 0;
    for (var subs of this.subscriptions.values()) count += subs.length;
    return count;
  }
  clearHistory(): void { this.eventHistory = []; }
  destroy(): void { this.subscriptions.clear(); this.eventHistory = []; }
}
export function createEventBus3(config: EventConfig3): EventBus3 { return new EventBus3(config); }