import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { JobRecord } from "./jobs";

/**
 * JSON-backed durable persistence for job records.
 *
 * Layout under the benchmark root:
 *   jobs/<job-id>.json  — full JobRecord
 *
 * Follows the same sync read/write pattern as BenchmarkStore. The store is
 * the single source of truth for job state across server restarts; the
 * in-memory JobManager Map is the fast-path for live queries.
 */
export class JobStore {
  private readonly dir: string;

  public constructor(root: string) {
    this.dir = join(root, "jobs");
  }

  public save(record: JobRecord): void {
    const p = this.jobPath(record.id);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(record, null, 2));
  }

  public load(id: string): JobRecord | null {
    const p = this.jobPath(id);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf-8")) as JobRecord;
    } catch {
      return null;
    }
  }

  public list(): JobRecord[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(this.dir, f), "utf-8")) as JobRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is JobRecord => r !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public update(id: string, fields: Partial<JobRecord>): void {
    const existing = this.load(id);
    if (existing === null) return;
    this.save({ ...existing, ...fields } as JobRecord);
  }

  private jobPath(id: string): string {
    return join(this.dir, `${id}.json`);
  }
}
