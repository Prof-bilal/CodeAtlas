import type { DatabaseSync } from "node:sqlite";
import type { PersistedModule } from "@atlas/core";
import { colString, count, type Row } from "./row";

/** CRUD for the `Modules` table. */
export class ModuleRepository {
  public constructor(private readonly db: DatabaseSync) {}

  /** Upsert a module by path. */
  public upsert(module: PersistedModule): void {
    this.db
      .prepare(
        `INSERT INTO Modules (path, name, module_type)
         VALUES (?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           name = excluded.name,
           module_type = excluded.module_type`,
      )
      .run(module.path, module.name, module.moduleType);
  }

  public findByPath(path: string): PersistedModule | undefined {
    const row = this.db.prepare("SELECT * FROM Modules WHERE path = ?").get(path) as
      | Row
      | undefined;
    return row === undefined ? undefined : moduleFromRow(row);
  }

  public all(): PersistedModule[] {
    return (this.db.prepare("SELECT * FROM Modules ORDER BY path").all() as Row[]).map(
      moduleFromRow,
    );
  }

  public deleteByPath(path: string): number {
    return count(this.db.prepare("DELETE FROM Modules WHERE path = ?").run(path).changes);
  }

  public clear(): number {
    return count(this.db.prepare("DELETE FROM Modules").run().changes);
  }
}

function moduleFromRow(row: Row): PersistedModule {
  return {
    path: colString(row, "path") ?? "",
    name: colString(row, "name") ?? "",
    moduleType: colString(row, "module_type") ?? "",
  };
}
