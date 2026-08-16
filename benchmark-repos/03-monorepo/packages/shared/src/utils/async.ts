export async function asyncFilter<T>(
  array: T[],
  predicate: (item: T, index: number) => Promise<boolean>
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < array.length; i++) {
    if (await predicate(array[i], i)) {
      results.push(array[i]);
    }
  }
  return results;
}

export async function asyncMap<T, U>(
  array: T[],
  mapper: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  return Promise.all(array.map((item, index) => mapper(item, index)));
}

export async function asyncForEach<T>(
  array: T[],
  callback: (item: T, index: number) => Promise<void>
): Promise<void> {
  for (let i = 0; i < array.length; i++) {
    await callback(array[i], i);
  }
}

export async function asyncReduce<T, U>(
  array: T[],
  reducer: (acc: U, item: T, index: number) => Promise<U>,
  initialValue: U
): Promise<U> {
  let accumulator = initialValue;
  for (let i = 0; i < array.length; i++) {
    accumulator = await reducer(accumulator, array[i], i);
  }
  return accumulator;
}

export async function asyncFind<T>(
  array: T[],
  predicate: (item: T, index: number) => Promise<boolean>
): Promise<T | undefined> {
  for (let i = 0; i < array.length; i++) {
    if (await predicate(array[i], i)) {
      return array[i];
    }
  }
  return undefined;
}

export async function asyncFindIndex<T>(
  array: T[],
  predicate: (item: T, index: number) => Promise<boolean>
): Promise<number> {
  for (let i = 0; i < array.length; i++) {
    if (await predicate(array[i], i)) {
      return i;
    }
  }
  return -1;
}

export async function asyncSome<T>(
  array: T[],
  predicate: (item: T, index: number) => Promise<boolean>
): Promise<boolean> {
  for (let i = 0; i < array.length; i++) {
    if (await predicate(array[i], i)) return true;
  }
  return false;
}

export async function asyncEvery<T>(
  array: T[],
  predicate: (item: T, index: number) => Promise<boolean>
): Promise<boolean> {
  for (let i = 0; i < array.length; i++) {
    if (!(await predicate(array[i], i))) return false;
  }
  return true;
}

export async function asyncFlatMap<T, U>(
  array: T[],
  mapper: (item: T, index: number) => Promise<U[]>
): Promise<U[]> {
  const results = await asyncMap(array, mapper);
  return results.flat();
}

export async function asyncGroupBy<T>(
  array: T[],
  keyFn: (item: T) => Promise<string>
): Promise<Record<string, T[]>> {
  const groups: Record<string, T[]> = {};
  for (const item of array) {
    const key = await keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

export async function asyncPartition<T>(
  array: T[],
  predicate: (item: T) => Promise<boolean>
): Promise<[T[], T[]]> {
  const truthy: T[] = [];
  const falsy: T[] = [];
  for (const item of array) {
    if (await predicate(item)) {
      truthy.push(item);
    } else {
      falsy.push(item);
    }
  }
  return [truthy, falsy];
}

export async function asyncUniqueBy<T>(
  array: T[],
  keyFn: (item: T) => Promise<string>
): Promise<T[]> {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of array) {
    const key = await keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export async function asyncSortBy<T>(
  array: T[],
  compareFn: (a: T, b: T) => Promise<number>
): Promise<T[]> {
  return [...array].sort(async (a, b) => compareFn(a, b));
}

export async function asyncBatch<T, U>(
  array: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<U[]>
): Promise<U[]> {
  const results: U[] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    const batch = array.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }
  return results;
}

export async function asyncTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export async function asyncRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

export async function asyncDebounce<T>(
  fn: () => Promise<T>,
  delayMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        resolve(await fn());
      } catch (error) {
        reject(error);
      }
    }, delayMs);
  });
}
