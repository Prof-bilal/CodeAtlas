import { DomainEvent } from '@atlas/shared';
export interface IDomainEventHandler<T = unknown> {
  handle(event: DomainEvent<T>): Promise<void>;
  canHandle(event: DomainEvent): boolean;
}
export class DomainEventDispatcher {
  private handlers = new Map<string, IDomainEventHandler[]>();
  register<T>(type: string, handler: IDomainEventHandler<T>): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler as IDomainEventHandler);
  }
  async dispatch(event: DomainEvent): Promise<void> {
    const h = this.handlers.get(event.eventType) ?? [];
    await Promise.all(h.filter(hh => hh.canHandle(event)).map(hh => hh.handle(event)));
  }
}