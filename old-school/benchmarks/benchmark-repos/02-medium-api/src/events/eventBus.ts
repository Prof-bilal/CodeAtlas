import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from '../utils/events.js';
import { logger } from '../utils/logger.js';

export interface Event {
  id: string;
  type: string;
  source: string;
  data: any;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface EventHandler {
  handle(event: Event): Promise<void>;
}

export interface EventBusEvents {
  eventPublished: Event;
  eventHandled: Event;
  eventFailed: { event: Event; error: Error };
}

export class EventBus extends EventEmitter<EventBusEvents> {
  private handlers: Map<string, EventHandler[]> = new Map();
  private eventStore: Event[] = [];

  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async publish(eventType: string, data: any, source: string, metadata?: Record<string, any>): Promise<Event> {
    const event: Event = {
      id: uuidv4(),
      type: eventType,
      source,
      data,
      metadata,
      timestamp: new Date(),
    };

    this.eventStore.push(event);
    this.emit('eventPublished', event);

    const handlers = this.handlers.get(eventType) || [];
    
    for (const handler of handlers) {
      try {
        await handler.handle(event);
        this.emit('eventHandled', event);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Error handling event ${eventType}:`, err);
        this.emit('eventFailed', { event, error: err });
      }
    }

    return event;
  }

  getEvents(type?: string, limit: number = 100): Event[] {
    let events = this.eventStore;
    if (type) {
      events = events.filter(e => e.type === type);
    }
    return events.slice(-limit);
  }

  getEventById(id: string): Event | undefined {
    return this.eventStore.find(e => e.id === id);
  }

  clear(): void {
    this.eventStore = [];
  }

  getStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    handlersCount: number;
  } {
    const eventsByType: Record<string, number> = {};
    
    for (const event of this.eventStore) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    }

    let handlersCount = 0;
    for (const handlers of this.handlers.values()) {
      handlersCount += handlers.length;
    }

    return {
      totalEvents: this.eventStore.length,
      eventsByType,
      handlersCount,
    };
  }
}

export const eventBus = new EventBus();
