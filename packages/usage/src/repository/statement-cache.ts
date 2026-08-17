import type { DatabaseSync, StatementSync } from "node:sqlite";

/**
 * Lazily caches one prepared statement per SQL text.
 *
 * `node:sqlite`'s `StatementSync` has no `close()` method on this runtime
 * (Node 24): native `sqlite3_stmt` memory is reclaimed only when the database
 * closes, and each live statement also keeps a native copy of its bound
 * strings. Bulk writers must reuse a bounded set of statements instead of
 * calling `db.prepare()` per row, or native memory grows without bound (the
 * full-corpus save previously leaked hundreds of MB). Usage writes are small,
 * but the repositories share the pattern for safety and consistency.
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
