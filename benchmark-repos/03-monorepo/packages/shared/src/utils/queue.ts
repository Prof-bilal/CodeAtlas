export interface QueueOptions<T> {
  maxSize?: number;
  onDrain?: () => void;
  onItemAdd?: (item: T) => void;
  onItemRemove?: (item: T) => void;
}

export class Queue<T> {
  private items: T[] = [];
  private options: Required<QueueOptions<T>>;

  constructor(options: QueueOptions<T> = {}) {
    this.options = {
      maxSize: options.maxSize || Infinity,
      onDrain: options.onDrain || (() => {}),
      onItemAdd: options.onItemAdd || (() => {}),
      onItemRemove: options.onItemRemove || (() => {}),
    };
  }

  enqueue(item: T): boolean {
    if (this.items.length >= this.options.maxSize) return false;
    this.items.push(item);
    this.options.onItemAdd(item);
    return true;
  }

  dequeue(): T | undefined {
    const item = this.items.shift();
    if (item !== undefined) {
      this.options.onItemRemove(item);
      if (this.items.length === 0) this.options.onDrain();
    }
    return item;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  isFull(): boolean {
    return this.items.length >= this.options.maxSize;
  }

  clear(): void {
    this.items = [];
  }

  toArray(): T[] {
    return [...this.items];
  }

  contains(item: T): boolean {
    return this.items.includes(item);
  }

  remove(item: T): boolean {
    const index = this.items.indexOf(item);
    if (index > -1) {
      this.items.splice(index, 1);
      this.options.onItemRemove(item);
      return true;
    }
    return false;
  }

  forEach(callback: (item: T, index: number) => void): void {
    this.items.forEach(callback);
  }

  map<U>(callback: (item: T, index: number) => U): U[] {
    return this.items.map(callback);
  }

  filter(callback: (item: T, index: number) => boolean): T[] {
    return this.items.filter(callback);
  }

  find(callback: (item: T, index: number) => boolean): T | undefined {
    return this.items.find(callback);
  }

  getFront(): T | undefined {
    return this.items[0];
  }

  getBack(): T | undefined {
    return this.items[this.items.length - 1];
  }
}

export function createQueue<T>(options?: QueueOptions<T>): Queue<T> {
  return new Queue<T>(options);
}

export class PriorityQueue<T> {
  private items: Array<{ item: T; priority: number }> = [];

  enqueue(item: T, priority: number): void {
    this.items.push({ item, priority });
    this.items.sort((a, b) => b.priority - a.priority);
  }

  dequeue(): T | undefined {
    return this.items.shift()?.item;
  }

  peek(): T | undefined {
    return this.items[0]?.item;
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  contains(item: T): boolean {
    return this.items.some(entry => entry.item === item);
  }

  clear(): void {
    this.items = [];
  }

  toArray(): T[] {
    return this.items.map(entry => entry.item);
  }
}

export function createPriorityQueue<T>(): PriorityQueue<T> {
  return new PriorityQueue<T>();
}
