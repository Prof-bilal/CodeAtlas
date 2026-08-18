import { type Row, colString, count } from "./row";
import { StatementCache } from "./statement-cache";

/** CRUD for the `Metadata` table (string key/value store). */
export class MetadataRepository extends StatementCache {
  public set(key: string, value: string): void {
    this.prepare(
      `INSERT INTO Metadata (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(key, value);
  }

  public get(key: string): string | undefined {
    const row = this.prepare("SELECT value FROM Metadata WHERE key = ?").get(key) as
      | Row
      | undefined;
    const value = row === undefined ? null : colString(row, "value");
    return value ?? undefined;
  }

  public all(): Readonly<Record<string, string>> {
    const rows = this.prepare("SELECT key, value FROM Metadata").all() as Row[];
    const out: Record<string, string> = {};
    for (const mapRow of rows) {
      const key = colString(mapRow, "key");
      const value = colString(mapRow, "value");
      if (key !== null && value !== null) {
        out[key] = value;
      }
    }
    return out;
  }

  public deleteByKey(key: string): number {
    return count(this.prepare("DELETE FROM Metadata WHERE key = ?").run(key).changes);
  }

  public clear(): number {
    return count(this.prepare("DELETE FROM Metadata").run().changes);
  }
}
