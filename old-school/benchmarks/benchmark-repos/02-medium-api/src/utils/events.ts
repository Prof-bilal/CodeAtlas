export interface EventEmitterOptions {
  maxListeners?: number;
}

export class EventEmitter<T extends Record<string, any>> {
  private listeners: Map<keyof T, Set<Function>> = new Map();
  private maxListeners: number;

  constructor(options: EventEmitterOptions = {}) {
    this.maxListeners = options.maxListeners || 10;
  }

  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const eventListeners = this.listeners.get(event)!;
    
    if (eventListeners.size >= this.maxListeners) {
      console.warn(`Max listeners (${this.maxListeners}) exceeded for event: ${String(event)}`);
    }

    eventListeners.add(listener);
    return this;
  }

  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    const eventListeners = this.listeners.get(event);
    
    if (eventListeners) {
      eventListeners.delete(listener);
    }
    
    return this;
  }

  emit<K extends keyof T>(event: K, data: T[K]): boolean {
    const eventListeners = this.listeners.get(event);
    
    if (!eventListeners || eventListeners.size === 0) {
      return false;
    }

    for (const listener of eventListeners) {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for ${String(event)}:`, error);
      }
    }
    
    return true;
  }

  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    const wrapper = (data: T[K]) => {
      this.off(event, wrapper);
      listener(data);
    };
    
    return this.on(event, wrapper);
  }

  removeAllListeners<K extends keyof T>(event?: K): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    
    return this;
  }

  listenerCount<K extends keyof T>(event: K): number {
    return this.listeners.get(event)?.size || 0;
  }

  eventNames(): (keyof T)[] {
    return Array.from(this.listeners.keys());
  }
}
