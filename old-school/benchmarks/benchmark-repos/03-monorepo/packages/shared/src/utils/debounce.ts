export interface DebounceOptions {
  delay: number;
  maxWait?: number;
  leading?: boolean;
  trailing?: boolean;
}

export interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
  pending: () => boolean;
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: DebounceOptions
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: unknown = null;
  let lastCallTime = 0;
  let result: ReturnType<T>;

  const delay = options.delay;
  const maxWait = options.maxWait || Infinity;
  const leading = options.leading || false;
  const trailing = options.trailing !== false;

  function invokeFunc(time: number): ReturnType<T> {
    const args = lastArgs!;
    const thisArg = lastThis;
    lastArgs = null;
    lastThis = null;
    result = fn.apply(thisArg, args);
    return result;
  }

  function startTimer(pendingDelay: number): ReturnType<typeof setTimeout> {
    return setTimeout(invokeTimerHandler, pendingDelay);
  }

  function invokeTimerHandler(): void {
    const now = Date.now();
    if (!leading) {
      lastCallTime = now;
    }
    const remaining = maxWait - (now - lastCallTime);
    if (remaining <= 0) {
      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId);
        maxTimeoutId = null;
      }
      invokeFunc(now);
    } else {
      timeoutId = startTimer(remaining);
    }
  }

  function cancel(): void {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (maxTimeoutId) {
      clearTimeout(maxTimeoutId);
      maxTimeoutId = null;
    }
    lastArgs = null;
    lastThis = null;
  }

  function flush(): void {
    if (timeoutId) {
      cancel();
      invokeFunc(Date.now());
    }
  }

  function pending(): boolean {
    return timeoutId !== null;
  }

  function debounced(this: unknown, ...args: Parameters<T>): void {
    const now = Date.now();
    const isInvoking = shouldInvoke(now);
    lastArgs = args;
    lastThis = this;
    lastCallTime = now;
    if (isInvoking && timeoutId === null && !leading) {
      timeoutId = startTimer(delay);
    }
    if (maxWait !== Infinity && maxTimeoutId === null) {
      maxTimeoutId = startTimer(maxWait);
    }
  }

  function shouldInvoke(time: number): boolean {
    const timeSinceLastCall = time - lastCallTime;
    return lastCallTime === 0 || timeSinceLastCall >= delay || timeSinceLastCall < 0;
  }

  const resultFn = debounced as DebouncedFunction<T>;
  resultFn.cancel = cancel;
  resultFn.flush = flush;
  resultFn.pending = pending;
  return resultFn;
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): DebouncedFunction<T> {
  return debounce(fn, { delay: limit, leading: true, trailing: true });
}
