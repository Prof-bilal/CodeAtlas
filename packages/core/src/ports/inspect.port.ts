import type { Result } from "@prof-bilal/atlas-shared";

/** A single HTTP probe target. */
export interface HttpProbeTarget {
  /** Full URL to probe (must start with http:// or https://). Localhost default. */
  readonly url: string;
  /** HTTP method. Default: GET. */
  readonly method?: string | undefined;
  /** Request headers. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** Request body (for POST/PUT/PATCH). */
  readonly body?: string | undefined;
  /** Timeout in milliseconds. Default: 5000. */
  readonly timeoutMs?: number | undefined;
}

/** Result of a single HTTP probe. */
export interface HttpProbeResult {
  readonly url: string;
  readonly method: string;
  readonly statusCode: number | null;
  readonly statusText: string | null;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
  readonly latencyMs: number;
  readonly error: string | null;
  readonly ok: boolean;
}

/**
 * Port for live HTTP inspection of running services.
 * Always requires explicit per-target approval (network egress).
 * Implemented as a thin adapter in `@prof-bilal/atlas-sdk`.
 */
export interface InspectPort {
  /** Send a single HTTP probe request and return the result. */
  probeHttp(target: HttpProbeTarget): Promise<Result<HttpProbeResult>>;
  /** Send multiple HTTP probes and return all results. */
  probeHttpBatch(targets: readonly HttpProbeTarget[]): Promise<Result<readonly HttpProbeResult[]>>;
}
