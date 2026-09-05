export interface AsyncOperation<T> {
  id: string;
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  cancel: () => void;
}

export class AsyncTaskManager {
  private operations: Map<string, AsyncOperation<any>> = new Map();
  private idCounter: number = 0;

  create<T>(fn: () => Promise<T>): AsyncOperation<T> {
    const id = `async-${++this.idCounter}`;
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    let cancelled = false;

    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    }).finally(() => {
      this.operations.delete(id);
    });

    const operation: AsyncOperation<T> = {
      id,
      promise,
      resolve: (value: T) => {
        if (!cancelled) {
          resolve(value);
        }
      },
      reject: (error: Error) => {
        if (!cancelled) {
          reject(error);
        }
      },
      cancel: () => {
        cancelled = true;
        this.operations.delete(id);
      },
    };

    this.operations.set(id, operation);

    fn().then(operation.resolve).catch(operation.reject);

    return operation;
  }

  async waitForAll(): Promise<void> {
    const promises = Array.from(this.operations.values()).map(op => op.promise);
    await Promise.allSettled(promises);
  }

  cancelAll(): void {
    for (const operation of this.operations.values()) {
      operation.cancel();
    }
  }

  getActiveCount(): number {
    return this.operations.size;
  }

  getStats(): {
    active: number;
    operations: string[];
  } {
    return {
      active: this.operations.size,
      operations: Array.from(this.operations.keys()),
    };
  }
}

export const taskManager = new AsyncTaskManager();
