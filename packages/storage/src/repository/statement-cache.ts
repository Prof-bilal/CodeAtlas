import type { DatabaseSync, StatementSync } from "node:sqlite";

/**
 * Lazily caches one prepared statement per SQL text.
 *
 * `node:sqlite`'s `StatementSync` has no `close()` method on this runtime
 * (Node 24): native `sqlite3_stmt` memory is reclaimed only when the database
 * closes. Inline `db.prepare(sql)` per row — as the repositories used to do —
 * leaked hundreds of megabytes of native memory on the full-corpus save
 * (each statement also keeps a native copy of its bound strings until it is
 * finalized) and slowed bulk writes roughly 4×. Caching one statement per SQL
 * keeps native memory bounded to a single live binding per query and makes
 * bulk writes fast.
 */
export abstract class StatementCache {
  private readonly statements = new Map<string, StatementSync>();

  protected constructor(protected readonly db: DatabaseSync) {}

  protected prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (statement === undefined) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }
}
