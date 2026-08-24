import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Server configuration for the CodeAtlas Benchmark API.
 *
 * Everything is localhost-first: the default bind address is `127.0.0.1`, the
 * benchmark store is the repository's `.codeatlas/benchmarks/` directory, and
 * the community library is a JSON file the operator can edit. No credentials,
 * no remote state.
 */
export interface ServerConfig {
  /** Bind host (default `127.0.0.1`; override for containerized setups). */
  readonly host: string;
  /** Bind port (default `8787`). */
  readonly port: number;
  /** Benchmark store root (default `<repo>/.codeatlas/benchmarks`). */
  readonly benchmarkRoot: string;
  /** Community repository library JSON (default `<app>/config/community-repos.json`). */
  readonly communityConfigPath: string;
  /**
   * Directory of a built UI to serve statically (default
   * `<repo>/CodeAtlas-ui/dist` when it exists). Empty string disables.
   */
  readonly uiDist: string;
  /** Maximum queued jobs before `POST` returns 429 (rate limiting). */
  readonly maxQueuedJobs: number;
  /** Cooperative wall-clock budget per job (default 60 minutes). */
  readonly jobTimeoutMs: number;
  /** Budget for shallow-cloning a community repository (default 10 minutes). */
  readonly cloneTimeoutMs: number;
  /** Budget for `git ls-remote` availability checks (default 10 seconds). */
  readonly availabilityTimeoutMs: number;
  /** Maximum request body size (default 1 MiB). */
  readonly maxBodyBytes: number;
}

/** Monorepo root (the directory containing `pnpm-workspace.yaml`). */
export function findRepositoryRoot(): string {
  const candidates = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const start of candidates) {
    let dir = resolve(start);
    for (let i = 0; i < 8; i += 1) {
      if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const root = findRepositoryRoot();
  // `src/` in dev/tests, `dist/` when built — the config sits one level up.
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const defaultUi = join(root, "CodeAtlas-ui", "dist");
  const uiDist =
    process.env["ATLAS_UI_DIST"] !== undefined
      ? process.env["ATLAS_UI_DIST"]
      : existsSync(defaultUi)
        ? defaultUi
        : "";
  return {
    host: process.env["ATLAS_SERVER_HOST"] ?? "127.0.0.1",
    port: intEnv("ATLAS_SERVER_PORT", 8787),
    benchmarkRoot: process.env["ATLAS_BENCHMARK_ROOT"] ?? join(root, ".codeatlas", "benchmarks"),
    communityConfigPath:
      process.env["ATLAS_COMMUNITY_REPOS"] ?? join(appDir, "config", "community-repos.json"),
    uiDist,
    maxQueuedJobs: intEnv("ATLAS_MAX_QUEUED_JOBS", 8),
    jobTimeoutMs: intEnv("ATLAS_JOB_TIMEOUT_MS", 60 * 60 * 1000),
    cloneTimeoutMs: intEnv("ATLAS_CLONE_TIMEOUT_MS", 10 * 60 * 1000),
    availabilityTimeoutMs: intEnv("ATLAS_AVAILABILITY_TIMEOUT_MS", 10_000),
    maxBodyBytes: intEnv("ATLAS_MAX_BODY_BYTES", 1024 * 1024),
    ...overrides,
  };
}
