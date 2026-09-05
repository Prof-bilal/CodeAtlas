export interface Pool<T> {
  acquire(): Promise<T>;
  release(item: T): void;
  destroy(): Promise<void>;
  getStats(): {
    size: number;
    available: number;
    inUse: number;
  };
}

export function createPool<T>(
  factory: () => Promise<T>,
  destroyer: (item: T) => Promise<void>,
  options: { maxSize?: number; minSize?: number } = {}
): Pool<T> {
  const { maxSize = 10, minSize = 2 } = options;
  
  const available: T[] = [];
  const inUse: Set<T> = new Set();
  
  async function createItem(): Promise<T> {
    return factory();
  }
  
  async function destroyItem(item: T): Promise<void> {
    await destroyer(item);
  }
  
  return {
    async acquire(): Promise<T> {
      if (available.length > 0) {
        const item = available.pop()!;
        inUse.add(item);
        return item;
      }
      
      if (inUse.size < maxSize) {
        const item = await createItem();
        inUse.add(item);
        return item;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.acquire();
    },
    
    release(item: T): void {
      if (inUse.has(item)) {
        inUse.delete(item);
        available.push(item);
      }
    },
    
    async destroy(): Promise<void> {
      for (const item of available) {
        await destroyItem(item);
      }
      
      for (const item of inUse) {
        await destroyItem(item);
      }
      
      available.length = 0;
      inUse.clear();
    },
    
    getStats() {
      return {
        size: available.length + inUse.size,
        available: available.length,
        inUse: inUse.size,
      };
    },
  };
}
