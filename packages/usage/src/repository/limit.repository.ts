import type { DatabaseSync } from "node:sqlite";
import type { UsageLimit, UsageScope } from "@atlas/core";
import { colNumber, colString, count, type Row } from "./row";

/** CRUD for the `Limits` table (hard caps — deny calls when exceeded). */
export class LimitRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public upsert(limit: UsageLimit): void {
    this.db
      .prepare(
        `INSERT INTO Limits (id, scope_kind, scope_value, currency, token_limit, cost_limit, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scope_kind, scope_value) DO UPDATE SET
           id = excluded.id,
           currency = excluded.currency,
           token_limit = excluded.token_limit,
           cost_limit = excluded.cost_limit,
           created_at = excluded.created_at`,
      )
      .run(
        limit.id,
        limit.scope.kind,
        limit.scope.value,
        limit.currency,
        limit.tokenLimit,
        limit.costLimit,
        limit.createdAt,
      );
  }

  public get(scope: UsageScope): UsageLimit | undefined {
    const row = this.db
      .prepare("SELECT * FROM Limits WHERE scope_kind = ? AND scope_value = ?")
      .get(scope.kind, scope.value) as Row | undefined;
    return row === undefined ? undefined : limitFromRow(row);
  }

  public all(): UsageLimit[] {
    return (this.db.prepare("SELECT * FROM Limits ORDER BY scope_kind, scope_value").all() as Row[]).map(
      limitFromRow,
    );
  }

  public clear(): number {
    return count(this.db.prepare("DELETE FROM Limits").run().changes);
  }
}

function limitFromRow(row: Row): UsageLimit {
  return {
    id: colString(row, "id") ?? "",
    scope: {
      kind: (colString(row, "scope_kind") ?? "user") as UsageLimit["scope"]["kind"],
      value: colString(row, "scope_value") ?? "",
    },
    tokenLimit: nullableNumber(row, "token_limit"),
    costLimit: nullableNumber(row, "cost_limit"),
    currency: colString(row, "currency"),
    createdAt: colString(row, "created_at") ?? "",
  };
}

function nullableNumber(row: Row, key: string): number | null {
  const value = row[key];
  if (typeof value === "number") {
    return value;
  }
  return typeof value === "bigint" ? Number(value) : null;
}
