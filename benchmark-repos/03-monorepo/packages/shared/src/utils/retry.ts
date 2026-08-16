export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  retryOn?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<RetryResult<T>> {
  const { maxAttempts, delayMs, backoffMultiplier = 1, maxDelayMs = 30000, retryOn, onRetry } = options;
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn();
      return { success: true, value, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (retryOn && !retryOn(lastError)) {
        return { success: false, error: lastError, attempts: attempt };
      }
      if (attempt < maxAttempts) {
        const delay = Math.min(delayMs * Math.pow(backoffMultiplier, attempt - 1), maxDelayMs);
        onRetry?.(attempt, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return { success: false, error: lastError, attempts: maxAttempts };
}

export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  timeoutMs: number
): Promise<RetryResult<T>> {
  return retry(fn, {
    ...options,
    retryOn: (error) => {
      if (error.name === 'TimeoutError') return false;
      return options.retryOn ? options.retryOn(error) : true;
    },
  });
}

export function createRetryFunction<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): () => Promise<RetryResult<T>> {
  return () => retry(fn, options);
}

export class RetryManager {
  private retryCounts: Map<string, number> = new Map();

  shouldRetry(key: string, maxRetries: number): boolean {
    const count = this.retryCounts.get(key) || 0;
    if (count >= maxRetries) return false;
    this.retryCounts.set(key, count + 1);
    return true;
  }

  getRetryCount(key: string): number {
    return this.retryCounts.get(key) || 0;
  }

  reset(key: string): void {
    this.retryCounts.delete(key);
  }

  resetAll(): void {
    this.retryCounts.clear();
  }

  getStats() {
    return {
      totalKeys: this.retryCounts.size,
      retries: Object.fromEntries(this.retryCounts),
    };
  }
}

export function createRetryManager(): RetryManager {
  return new RetryManager();
}
