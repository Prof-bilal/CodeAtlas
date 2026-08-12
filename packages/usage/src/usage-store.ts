import type { DatabaseSync } from "node:sqlite";
import type { Budget, UsageLimit, UsageQuery, UsageRecord, UsageScope } from "@atlas/core";
import { openDatabase } from "./db";
import { type Migration, lastAppliedVersion, runMigrations } from "./migrations";
import { BudgetRepository } from "./repository/budget.repository";
import { LimitRepository } from "./repository/limit.repository";
import { UsageRepository } from "./repository/usage.repository";
import { inTransaction } from "./transaction";

export interface UsageStoreOptions {
  /** Database file path, or `":memory:"` for a throwaway store. */
  readonly filePath?: string;
  /** Custom migrations; defaults to the built-in usage schema migrations. */
  readonly migrations?: readonly Migration[];
}

/**
 * A synchronous SQLite-backed usage store, **owned by the usage module** and
 * separate from the context database. Implements persistence for usage events,
 * budgets, and limits behind the repository classes. No business logic lives
 * here — it is the persistence boundary only.
 */
export class UsageStore {
  private readonly db: DatabaseSync;
  private readonly usage: UsageRepository;
  private readonly budgets: BudgetRepository;
  private readonly limits: LimitRepository;

  public constructor(options: UsageStoreOptions = {}) {
    this.db = openDatabase(options.filePath ?? ":memory:");
    runMigrations(this.db, options.migrations);
    this.usage = new UsageRepository(this.db);
    this.budgets = new BudgetRepository(this.db);
    this.limits = new LimitRepository(this.db);
  }

  /** The latest applied schema version. */
  public get version(): number {
    return lastAppliedVersion(this.db);
  }

  public insertUsage(record: UsageRecord): void {
    inTransaction(this.db, () => {
      this.usage.insert(record);
    });
  }

  public getUsage(id: string): UsageRecord | undefined {
    return this.usage.get(id);
  }

  public listUsage(query: UsageQuery = {}): readonly UsageRecord[] {
    return this.usage.find(query);
  }

  public upsertBudget(budget: Budget): void {
    this.budgets.upsert(budget);
  }

  public getBudget(scope: UsageScope): Budget | undefined {
    return this.budgets.get(scope);
  }

  public listBudgets(): readonly Budget[] {
    return this.budgets.all();
  }

  public upsertLimit(limit: UsageLimit): void {
    this.limits.upsert(limit);
  }

  public getLimit(scope: UsageScope): UsageLimit | undefined {
    return this.limits.get(scope);
  }

  public listLimits(): readonly UsageLimit[] {
    return this.limits.all();
  }

  public close(): void {
    this.db.close();
  }
}
