export abstract class ValueObject<T> {
  protected readonly _value: T;
  protected constructor(value: T) { this._value = Object.freeze(value); }
  get value(): T { return this._value; }
  abstract equals(other: ValueObject<T>): boolean;
}