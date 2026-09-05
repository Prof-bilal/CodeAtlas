export interface QueueItem<T> {
  id: string;
  data: T;
  priority: number;
  createdAt: Date;
  processedAt?: Date;
}

export class PriorityQueue<T> {
  private items: QueueItem<T>[] = [];
  private idCounter: number = 0;

  enqueue(data: T, priority: number = 0): string {
    const id = `item-${++this.idCounter}`;
    const item: QueueItem<T> = {
      id,
      data,
      priority,
      createdAt: new Date(),
    };

    this.items.push(item);
    this.items.sort((a, b) => b.priority - a.priority);
    
    return id;
  }

  dequeue(): QueueItem<T> | undefined {
    return this.items.shift();
  }

  peek(): QueueItem<T> | undefined {
    return this.items[0];
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  remove(id: string): boolean {
    const index = this.items.findIndex(item => item.id === id);
    
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    
    return false;
  }

  find(id: string): QueueItem<T> | undefined {
    return this.items.find(item => item.id === id);
  }

  toArray(): QueueItem<T>[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }

  getStats(): {
    size: number;
    oldestItem?: Date;
    newestItem?: Date;
    averagePriority: number;
  } {
    if (this.items.length === 0) {
      return {
        size: 0,
        averagePriority: 0,
      };
    }

    const priorities = this.items.map(item => item.priority);
    const averagePriority = priorities.reduce((a, b) => a + b, 0) / priorities.length;

    return {
      size: this.items.length,
      oldestItem: this.items[this.items.length - 1]?.createdAt,
      newestItem: this.items[0]?.createdAt,
      averagePriority,
    };
  }
}
