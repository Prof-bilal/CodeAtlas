import type { DatabaseSync } from "node:sqlite";
import { colString, count, type Row } from "./row";

/** CRUD for the `Hashes` table (path → SHA-256 digest). */
export class HashRepository {
  public constructor(private readonly db: DatabaseSync) {}

  /** Upsert a path's hash. */
  public upsert(path: string, hash: string): void {
    this.db
      .prepare(
        `INSERT INTO Hashes (path, hash, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           hash = excluded.hash,
           updated_at = excluded.updated_at`,
      )
      .run(path, hash, new Date().toISOString());
  }

  public findByPath(path: string): string | undefined {
    const row = this.db.prepare("SELECT hash FROM Hashes WHERE path = ?").get(path) as
      | Row
      | undefined;
    const value = row === undefined ? null : colString(row, "hash");
    return value ?? undefined;
  }

  public all(): Readonly<Record<string, string>> {
    const rows = this.db.prepare("SELECT path, hash FROM Hashes").all() as Row[];
    const out: Record<string, string> = {};
    for (const mapRow of rows) {
      const path = colString(mapRow, "path");
      const hash = colString(mapRow, "hash");
      if (path !== null && hash !== null) {
        out[path] = hash;
      }
    }
    return out;
  }

  public deleteByPath(path: string): number {
    return count(this.db.prepare("DELETE FROM Hashes WHERE path = ?").run(path).changes);
  }

  public clear(): number {
    return count(this.db.prepare("DELETE FROM Hashes").run().changes);
  }
}
