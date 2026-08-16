import type { MetricsPort } from "@atlas/core";
import { MetricsService, type MetricsStore } from "@atlas/metrics";

/** Options for {@link createMetricsService}. */
export interface CreateMetricsServiceOptions {
  /** Path of the metrics JSON file (`.codeatlas/metrics.json`). */
  readonly filePath?: string;
  /** Inject a metrics store for tests. */
  readonly store?: MetricsStore;
}

/**
 * Create the Metrics / Token Analytics service.
 *
 * The returned `MetricsPort` reads and writes `.codeatlas/metrics.json` —
 * a local, versioned, JSON-first metrics file with atomic writes.
 */
export function createMetricsService(options: CreateMetricsServiceOptions = {}): MetricsPort {
  return new MetricsService(
    options.filePath !== undefined
      ? {
          filePath: options.filePath,
          ...(options.store !== undefined ? { store: options.store } : {}),
        }
      : undefined,
  );
}
