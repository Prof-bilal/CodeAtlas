import os from "node:os";

/**
 * Default concurrency for parallel I/O helpers, derived from the CPU count
 * (capped so a busy machine does not thrash).
 */
export const DEFAULT_CONCURRENCY = Math.max(2, Math.min(16, os.availableParallelism()));

/**
 * Map `items` to results with bounded concurrency.
 *
 * `tasks` are started lazily; at most `limit` run in flight at once. Results
 * are returned in input order. A task rejection rejects the whole call (the
 * remaining tasks are abandoned). Useful for parallelizing I/O-bound work
 * (hashing, file reads) over many paths without exhausting the event loop or
 * file descriptors.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = next;
      if (index >= items.length) {
        return;
      }
      next += 1;
      results[index] = await task(items[index], index);
    }
  };

  const workers: Promise<void>[] = [];
  const active = Math.max(1, Math.min(limit, items.length));
  for (let i = 0; i < active; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
