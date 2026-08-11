import type { DatabaseSync } from "node:sqlite";
import type { PersistedDependency } from "@atlas/core";
import type { NodeId } from "@atlas/shared";
import { colString, count, metadataFromRow, type Row } from "./row";

/** CRUD for the `Dependencies` table (code-dependency edges). */
export class DependencyRepository {
  public constructor(private readonly db: DatabaseSync) {}

  /** Upsert a dependency edge (deduped by source, target, kind). */
  public upsert(dependency: PersistedDependency): void {
    this.db
      .prepare(
        `INSERT INTO Dependencies (source_id, target_id, kind, metadata)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(source_id, target_id, kind) DO UPDATE SET
           metadata = excluded.metadata`,
      )
      .run(
        dependency.from,
        dependency.to,
        dependency.kind,
        dependency.metadata === undefined ? null : JSON.stringify(dependency.metadata),
      );
  }

  public all(): PersistedDependency[] {
    return (
      this.db.prepare("SELECT * FROM Dependencies ORDER BY source_id, target_id").all() as Row[]
    ).map(dependencyFromRow);
  }

  /** Remove every edge touching a node (used by `deleteContext` cleanup). */
  public deleteByNodeId(nodeId: string): number {
    return count(
      this.db
        .prepare("DELETE FROM Dependencies WHERE source_id = ? OR target_id = ?")
        .run(nodeId, nodeId).changes,
    );
  }

  public clear(): number {
    return count(this.db.prepare("DELETE FROM Dependencies").run().changes);
  }
}

function dependencyFromRow(row: Row): PersistedDependency {
  const metadata = metadataFromRow(row, "metadata");
  return {
    from: colString(row, "source_id") as NodeId,
    to: colString(row, "target_id") as NodeId,
    kind: colString(row, "kind") ?? "",
    ...(metadata !== undefined ? { metadata } : {}),
  };
}
