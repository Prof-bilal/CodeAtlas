import { BenchmarkService } from "@prof-bilal/atlas-benchmark";
import type { BenchmarkPort } from "@prof-bilal/atlas-core";

/** Options for creating a benchmark service via the SDK. */
export interface CreateBenchmarkServiceOptions {
  /** Root directory for benchmark data (default: `.codeatlas/benchmarks`). */
  readonly root?: string;
}

/**
 * Create the benchmark service.
 *
 * The returned `BenchmarkPort` manages benchmark suites, runs tasks through
 * injected runners, evaluates accuracy, and generates Markdown reports.
 */
export function createBenchmarkService(options: CreateBenchmarkServiceOptions = {}): BenchmarkPort {
  const opts = options.root !== undefined ? { root: options.root } : {};
  return new BenchmarkService(opts);
}
