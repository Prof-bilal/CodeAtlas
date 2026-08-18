/**
 * MetricsStore — JSON file persistence for metrics.
 *
 * Uses atomic writes (write to .tmp then rename) to prevent corruption.
 * The file lives at `.codeatlas/metrics.json` inside the repository root.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { MetricsSnapshot } from "@atlas/core";
import {
  MAX_METRICS_FILE_SIZE,
  METRICS_FILE_NAME,
  METRICS_SCHEMA_VERSION,
  createEmptySnapshot,
  validateSnapshot,
} from "./types";

export interface MetricsStoreOptions {
  /** Path to the metrics JSON file. Defaults to `<cwd>/.codeatlas/metrics.json`. */
  readonly filePath: string;
}

export class MetricsStore {
  private readonly filePath: string;
  private snapshot: MetricsSnapshot | null = null;

  constructor(
    options: MetricsStoreOptions = {
      filePath: join(process.cwd(), ".codeatlas", METRICS_FILE_NAME),
    },
  ) {
    this.filePath = options.filePath;
  }

  /** Load the snapshot from disk, or return an empty default. */
  load(): MetricsSnapshot {
    if (this.snapshot !== null) {
      return this.snapshot;
    }
    if (!existsSync(this.filePath)) {
      this.snapshot = createEmptySnapshot("unknown");
      return this.snapshot;
    }

    const stat = statSync(this.filePath, { throwIfNoEntry: false });
    if (stat !== undefined && stat.size > MAX_METRICS_FILE_SIZE) {
      this.snapshot = createEmptySnapshot("unknown");
      return this.snapshot;
    }

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (!validateSnapshot(parsed)) {
        this.snapshot = createEmptySnapshot("unknown");
        return this.snapshot;
      }
      if (parsed.version > METRICS_SCHEMA_VERSION) {
        this.snapshot = createEmptySnapshot("unknown");
        return this.snapshot;
      }
      this.snapshot = parsed;
      return this.snapshot;
    } catch {
      this.snapshot = createEmptySnapshot("unknown");
      return this.snapshot;
    }
  }

  /** Save the snapshot to disk with an atomic write. */
  save(snapshot: MetricsSnapshot): void {
    this.snapshot = snapshot;
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    const json = JSON.stringify(snapshot, null, 2);

    writeFileSync(tmpPath, json, "utf-8");
    renameSync(tmpPath, this.filePath);
  }

  /** Get the in-memory snapshot (loads if needed). */
  getSnapshot(): MetricsSnapshot {
    return this.snapshot ?? this.load();
  }

  /** Get the file path. */
  getFilePath(): string {
    return this.filePath;
  }

  /** Check if the metrics file exists on disk. */
  exists(): boolean {
    return existsSync(this.filePath);
  }

  /** Delete the metrics file (for reset). */
  remove(): void {
    if (existsSync(this.filePath)) {
      try {
        unlinkSync(this.filePath);
      } catch {
        // Ignore removal errors
      }
    }
    this.snapshot = null;
  }
}
