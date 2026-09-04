export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config: RetryOptions = {
    maxRetries: options.maxRetries || 3,
    delayMs: options.delayMs || 1000,
    backoffMultiplier: options.backoffMultiplier || 2,
    maxDelayMs: options.maxDelayMs || 30000,
  };

  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === config.maxRetries) {
        break;
      }

      const delay = Math.min(
        config.delayMs * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelayMs
      );
      
      await sleep(delay);
    }
  }

  throw lastError;
}

export async function retryWithPredicate<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: Error, attempt: number) => boolean,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config: RetryOptions = {
    maxRetries: options.maxRetries || 3,
    delayMs: options.delayMs || 1000,
    backoffMultiplier: options.backoffMultiplier || 2,
    maxDelayMs: options.maxDelayMs || 30000,
  };

  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === config.maxRetries || !shouldRetry(lastError, attempt)) {
        break;
      }

      const delay = Math.min(
        config.delayMs * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelayMs
      );
      
      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
