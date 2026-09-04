export interface Timer {
  start(): void;
  stop(): number;
  getElapsed(): number;
  reset(): void;
}

export function createTimer(): Timer {
  let startTime: number = 0;
  let elapsedTime: number = 0;
  let running: boolean = false;

  return {
    start() {
      if (!running) {
        startTime = Date.now();
        running = true;
      }
    },
    stop() {
      if (running) {
        elapsedTime += Date.now() - startTime;
        running = false;
      }
      return elapsedTime;
    },
    getElapsed() {
      if (running) {
        return elapsedTime + (Date.now() - startTime);
      }
      return elapsedTime;
    },
    reset() {
      startTime = 0;
      elapsedTime = 0;
      running = false;
    },
  };
}

export async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const timer = createTimer();
  timer.start();
  
  try {
    const result = await fn();
    const duration = timer.stop();
    
    return { result, duration };
  } catch (error) {
    timer.stop();
    throw error;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): Promise<(...args: Parameters<T>) => Promise<ReturnType<T>>> {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    return new Promise((resolve, reject) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  };
}

export async function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): Promise<(...args: Parameters<T>) => Promise<ReturnType<T> | undefined>> {
  let inThrottle = false;
  let lastResult: ReturnType<T> | undefined;
  
  return async (...args: Parameters<T>) => {
    if (!inThrottle) {
      lastResult = await fn(...args);
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
    
    return lastResult;
  };
}
