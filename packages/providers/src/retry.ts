import type { Result } from "@atlas/shared";

/** Options for retry behavior. */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3). */
  readonly maxAttempts?: number;
  /** Initial delay in ms (default: 1000). */
  readonly baseDelayMs?: number;
  /** Maximum delay in ms (default: 30000). */
  readonly maxDelayMs?: number;
  /** Jitter factor 0-1 (default: 0.2). */
  readonly jitter?: number;
  /** Predicate to decide if an error is retryable. */
  readonly isRetryable?: (error: unknown) => boolean;
}

/** Default retry options. */
export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: 0.2,
  isRetryable: (error: unknown) => {
    // Retry on network errors, 429 (rate limit), 5xx server errors
    if (error instanceof Error) {
      // Network errors don't have a status
      if ("status" in error) {
        const status = (error as { status: number }).status;
        return status === 429 || (status >= 500 && status < 600);
      }
      // Generic network errors
      return true;
    }
    return false;
  },
};

/**
 * Execute a function with exponential backoff retry.
 *
 * @param fn - The async function to execute.
 * @param options - Retry configuration.
 * @returns The successful result or the last error.
 */
export async function withRetry<T>(
  fn: () => Promise<Result<T>>,
  options: RetryOptions = {},
): Promise<Result<T>> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt < opts.maxAttempts) {
    const result = await fn();
    if (result.ok) {
      return result;
    }

    if (result.error instanceof Error) {
      lastError = result.error;
    }
    attempt++;

    if (attempt >= opts.maxAttempts || !opts.isRetryable(result.error)) {
      break;
    }

    const delay = Math.min(
      opts.baseDelayMs * 2 ** (attempt - 1) + Math.random() * opts.baseDelayMs * opts.jitter,
      opts.maxDelayMs,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return { ok: false, error: lastError ?? new Error("Unknown error") };
}

/**
 * Check if an error is a retryable network error.
 */
export function isRetryableNetworkError(error: unknown): boolean {
  return DEFAULT_RETRY_OPTIONS.isRetryable(error);
}
