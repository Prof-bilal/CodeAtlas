// Domain events

export interface DomainEvent {
  type: string;
  payload: any;
  timestamp: Date;
  source: string;
}

export class EventPublisher {
  private events: DomainEvent[] = [];

  publish(type: string, payload: any, source: string) {
    this.events.push({
      type,
      payload,
      timestamp: new Date(),
      source,
    });
  }

  getEvents(): DomainEvent[] {
    return [...this.events];
  }
}
