import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

// `node:sqlite` is too new for Vite (used by the test runner) to keep the
// `node:` prefix on a static import, so the constructor is required at runtime
// via `createRequire`. The `DatabaseSync` type above is erased at runtime.
const requireNode = createRequire(import.meta.url);
const DatabaseSyncConstructor = requireNode("node:sqlite").DatabaseSync as typeof DatabaseSync;

/**
 * Open a SQLite database for the context store.
 *
 * `node:sqlite` is synchronous and fast. WAL journal mode (fewer read
 * stalls) only applies to file-backed databases — `:memory:` databases ignore
 * it. Foreign keys and a busy timeout are always enabled.
 */
export function openDatabase(filePath: string): DatabaseSync {
  const db = new DatabaseSyncConstructor(filePath);
  if (filePath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}
