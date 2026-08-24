import { createApp } from "./app";
import { loadConfig } from "./config";
import { JobManager } from "./jobs";
import { createRoutes } from "./routes";

/**
 * CodeAtlas Benchmark API entrypoint.
 *
 * Starts the localhost HTTP API (`127.0.0.1:8787` by default) that backs the
 * Atlas Benchmark UI: benchmark suites, community repository library, browser
 * benchmarks, and job progress. See ADR-013.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const jobs = new JobManager({
    maxConcurrent: 1,
    maxQueued: config.maxQueuedJobs,
    jobTimeoutMs: config.jobTimeoutMs,
  });
  const app = createApp({ config, routes: createRoutes({ config, jobs }), jobs });
  const { host, port } = await app.start();
  console.log(`CodeAtlas Benchmark API listening on http://${host}:${port}`);
  console.log(`  benchmark store: ${config.benchmarkRoot}`);
  if (config.uiDist !== "") {
    console.log(`  serving UI from: ${config.uiDist}`);
  }

  const shutdown = (): void => {
    void app.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
