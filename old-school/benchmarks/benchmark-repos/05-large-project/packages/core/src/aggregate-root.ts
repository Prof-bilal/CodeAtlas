import { Entity } from './entity.js';
import { DomainEvent } from '@atlas/shared';
export abstract class AggregateRoot<TId> extends Entity<TId> {
  private _domainEvents: DomainEvent[] = [];
  private _version = 0;
  get version(): number { return this._version; }
  protected addDomainEvent(event: DomainEvent): void { this._domainEvents.push(event); }
  clearEvents(): void { this._domainEvents = []; }
  abstract _applyEvent(event: DomainEvent): void;
  pullDomainEvents(): DomainEvent[] { const e = [...this._domainEvents]; this._domainEvents = []; return e; }
}