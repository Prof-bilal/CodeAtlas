export type EventListener<T = unknown> = (data: T) => void;

export interface EventOptions {
  once?: boolean;
  priority?: number;
}

interface ListenerEntry<T = unknown> {
  listener: EventListener<T>;
  options: EventOptions;
}

export class EventEmitter<Events extends Record<string, unknown> = Record<string, unknown>> {
  private listeners: Map<string, ListenerEntry[]> = new Map();
  private maxListeners: number;

  constructor(maxListeners: number = 100) {
    this.maxListeners = maxListeners;
  }

  on<K extends keyof Events>(event: K, listener: EventListener<Events[K]>, options?: EventOptions): () => void {
    return this.addListener(event, listener, options);
  }

  once<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): () => void {
    return this.addListener(event, listener, { once: true });
  }

  off<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
    const eventListeners = this.listeners.get(String(event));
    if (!eventListeners) return;
    const index = eventListeners.findIndex(entry => entry.listener === listener);
    if (index > -1) eventListeners.splice(index, 1);
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): boolean {
    const eventListeners = this.listeners.get(String(event));
    if (!eventListeners || eventListeners.length === 0) return false;
    const sorted = [...eventListeners].sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0));
    const toRemove: ListenerEntry[] = [];
    for (const entry of sorted) {
      entry.listener(data);
      if (entry.options.once) toRemove.push(entry);
    }
    for (const entry of toRemove) {
      const idx = eventListeners.indexOf(entry);
      if (idx > -1) eventListeners.splice(idx, 1);
    }
    return true;
  }

  removeAllListeners(event?: keyof Events): void {
    if (event) {
      this.listeners.delete(String(event));
    } else {
      this.listeners.clear();
    }
  }

  listenerCount(event: keyof Events): number {
    return this.listeners.get(String(event))?.length || 0;
  }

  eventNames(): string[] {
    return Array.from(this.listeners.keys()).filter(key => this.listeners.get(key)!.length > 0);
  }

  private addListener<K extends keyof Events>(event: K, listener: EventListener<Events[K]>, options: EventOptions = {}): () => void {
    const eventStr = String(event);
    if (!this.listeners.has(eventStr)) {
      this.listeners.set(eventStr, []);
    }
    const eventListeners = this.listeners.get(eventStr)!;
    if (eventListeners.length >= this.maxListeners) {
      console.warn(`Max listeners (${this.maxListeners}) exceeded for event: ${eventStr}`);
    }
    const entry: ListenerEntry<Events[K]> = { listener, options };
    eventListeners.push(entry);
    return () => this.off(event, listener);
  }
}

export function createEventEmitter<Events extends Record<string, unknown>>(maxListeners?: number): EventEmitter<Events> {
  return new EventEmitter<Events>(maxListeners);
}
