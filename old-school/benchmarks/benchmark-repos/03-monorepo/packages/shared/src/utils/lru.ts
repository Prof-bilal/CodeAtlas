export interface LRUNode<T> {
  key: string;
  value: T;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
  frequency: number;
}

export class LRUCache<T> {
  private capacity: number;
  private cache: Map<string, LRUNode<T>> = new Map();
  private head: LRUNode<T> | null = null;
  private tail: LRUNode<T> | null = null;
  private accessOrder: string[] = [];

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: string): T | undefined {
    const node = this.cache.get(key);
    if (!node) return undefined;
    this.moveToHead(node);
    return node.value;
  }

  set(key: string, value: T): void {
    const existing = this.cache.get(key);
    if (existing) {
      existing.value = value;
      this.moveToHead(existing);
      return;
    }
    const newNode: LRUNode<T> = { key, value, prev: null, next: null, frequency: 1 };
    this.cache.set(key, newNode);
    this.addToHead(newNode);
    if (this.cache.size > this.capacity) {
      this.evict();
    }
  }

  delete(key: string): boolean {
    const node = this.cache.get(key);
    if (!node) return false;
    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  values(): T[] {
    const result: T[] = [];
    let current = this.head;
    while (current) {
      result.push(current.value);
      current = current.next;
    }
    return result;
  }

  private addToHead(node: LRUNode<T>): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
    this.accessOrder.unshift(node.key);
  }

  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    const index = this.accessOrder.indexOf(node.key);
    if (index > -1) this.accessOrder.splice(index, 1);
  }

  private moveToHead(node: LRUNode<T>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private evict(): void {
    if (this.tail) {
      const key = this.tail.key;
      this.removeNode(this.tail);
      this.cache.delete(key);
    }
  }

  getAccessOrder(): string[] {
    return [...this.accessOrder];
  }

  getStats() {
    return {
      size: this.cache.size,
      capacity: this.capacity,
      hitRate: 0,
    };
  }
}

export function createLRUCache<T>(capacity: number): LRUCache<T> {
  return new LRUCache<T>(capacity);
}
