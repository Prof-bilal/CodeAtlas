import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

// The same `node:sqlite` loading workaround used by `@atlas/storage`: the
// built-in is too new for Vite (the test runner) to keep the `node:` prefix on
// a static import, so the constructor is required at runtime. `DatabaseSync`
// is a type only and erased at compile time.
const requireNode = createRequire(import.meta.url);
const DatabaseSyncConstructor = requireNode("node:sqlite").DatabaseSync as typeof DatabaseSync;

/**
 * Open a SQLite database for the usage store.
 *
 * `node:sqlite` is synchronous. WAL journal mode only applies to file-backed
 * databases (`:memory:` ignores it). Foreign keys and a busy timeout are always
 * enabled. The usage database is **separate** from the context database — this
 * module never touches `@atlas/storage` or its tables.
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
