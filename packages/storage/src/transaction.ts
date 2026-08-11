import type { DatabaseSync } from "node:sqlite";

/**
 * Run `fn` inside a transaction. When a transaction is already open (nested
 * call), `fn` runs in the outer one.
 */
export function inTransaction(db: DatabaseSync, fn: () => void): void {
  if (db.isTransaction) {
    fn();
    return;
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    fn();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
