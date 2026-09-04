// Event system - OLD
// DEPRECATED - use EventEmitter directly

type EventHandler = (...args: any[]) => void;

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler) {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  off(event: string, handler: EventHandler) {
    const handlers = this.handlers.get(event) || [];
    this.handlers.set(event, handlers.filter(h => h !== handler));
  }

  emit(event: string, ...args: any[]) {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach(handler => handler(...args));
  }
}

export const eventBus = new EventBus();
