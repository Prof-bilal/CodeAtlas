import type { DatabaseSync } from "node:sqlite";
import type { Budget, UsageScope } from "@atlas/core";
import { type Row, colString, count } from "./row";
import { StatementCache } from "./statement-cache";

/** CRUD for the `Budgets` table (soft targets — never block calls). */
export class BudgetRepository extends StatementCache {
  public constructor(db: DatabaseSync) {
    super(db);
  }

  public upsert(budget: Budget): void {
    this.prepare(
      `INSERT INTO Budgets (id, scope_kind, scope_value, currency, token_limit, cost_limit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope_kind, scope_value) DO UPDATE SET
         id = excluded.id,
         currency = excluded.currency,
         token_limit = excluded.token_limit,
         cost_limit = excluded.cost_limit,
         created_at = excluded.created_at`,
    ).run(
      budget.id,
      budget.scope.kind,
      budget.scope.value,
      budget.currency,
      budget.tokenLimit,
      budget.costLimit,
      budget.createdAt,
    );
  }

  public get(scope: UsageScope): Budget | undefined {
    const row = this.prepare("SELECT * FROM Budgets WHERE scope_kind = ? AND scope_value = ?").get(
      scope.kind,
      scope.value,
    ) as Row | undefined;
    return row === undefined ? undefined : budgetFromRow(row);
  }

  public all(): Budget[] {
    return (
      this.prepare("SELECT * FROM Budgets ORDER BY scope_kind, scope_value").all() as Row[]
    ).map(budgetFromRow);
  }

  public clear(): number {
    return count(this.prepare("DELETE FROM Budgets").run().changes);
  }
}

function budgetFromRow(row: Row): Budget {
  return {
    id: colString(row, "id") ?? "",
    scope: {
      kind: (colString(row, "scope_kind") ?? "user") as Budget["scope"]["kind"],
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
