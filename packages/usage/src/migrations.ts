import type { DatabaseSync } from "node:sqlite";
import { createSchema } from "./schema";
import { inTransaction } from "./transaction";

/** A single schema migration. Versions must be strictly increasing. */
export interface Migration {
  readonly version: number;
  readonly name: string;
  up(db: DatabaseSync): void;
}

/** The ordered migrations that build the usage schema. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "create-usage-schema", up: createSchema },
];

/** The highest applied migration version, or `0` when none have run. */
export function lastAppliedVersion(db: DatabaseSync): number {
  const row = db.prepare("SELECT MAX(version) AS version FROM Migrations").get() as {
    version: number | null;
  };
  return row.version ?? 0;
}

/**
 * Apply every pending migration in version order, each in its own transaction,
 * recording it in the `Migrations` table. Idempotent: already-applied versions
 * are skipped.
 */
export function runMigrations(
  db: DatabaseSync,
  migrations: readonly Migration[] = MIGRATIONS,
): void {
  db.exec(`CREATE TABLE IF NOT EXISTS Migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`);

  const start = lastAppliedVersion(db);
  for (const migration of migrations) {
    if (migration.version <= start) {
      continue;
    }
    inTransaction(db, () => {
      migration.up(db);
      db.prepare("INSERT INTO Migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    });
  }
}
