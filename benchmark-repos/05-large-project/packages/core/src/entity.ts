export abstract class Entity<TId> {
  protected _id: TId;
  protected _createdAt: Date;
  protected _updatedAt: Date;
  protected _deletedAt?: Date;
  constructor(id: TId) { this._id = id; this._createdAt = new Date(); this._updatedAt = new Date(); }
  get id(): TId { return this._id; }
  touch(): void { this._updatedAt = new Date(); }
  softDelete(): void { this._deletedAt = new Date(); this.touch(); }
  abstract toJSON(): Record<string, unknown>;
  equals(other: Entity<TId>): boolean { return other !== null && this._id === other._id; }
}