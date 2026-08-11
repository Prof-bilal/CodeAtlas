import type { DatabaseSync } from "node:sqlite";
import type { PersistedRelationship } from "@atlas/core";
import type { NodeId } from "@atlas/shared";
import { colString, count, metadataFromRow, type Row } from "./row";

/** CRUD for the `Relationships` table (generic entity links). */
export class RelationshipRepository {
  public constructor(private readonly db: DatabaseSync) {}

  /** Upsert a relationship (deduped by type, source, target). */
  public upsert(relationship: PersistedRelationship): void {
    this.db
      .prepare(
        `INSERT INTO Relationships (type, source_id, target_id, metadata)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(type, source_id, target_id) DO UPDATE SET
           metadata = excluded.metadata`,
      )
      .run(
        relationship.type,
        relationship.sourceId,
        relationship.targetId,
        relationshipPassingMetadata(relationship),
      );
  }

  public all(): PersistedRelationship[] {
    return (
      this.db
        .prepare("SELECT * FROM Relationships ORDER BY type, source_id, target_id")
        .all() as Row[]
    ).map(relationshipFromRow);
  }

  /** Remove every relationship touching a node (used by `deleteContext` cleanup). */
  public deleteByNodeId(nodeId: string): number {
    return count(
      this.db
        .prepare("DELETE FROM Relationships WHERE source_id = ? OR target_id = ?")
        .run(nodeId, nodeId).changes,
    );
  }

  public clear(): number {
    return count(this.db.prepare("DELETE FROM Relationships").run().changes);
  }
}

function relationshipPassingMetadata(relationship: PersistedRelationship): string | null {
  return relationship.metadata === undefined ? null : JSON.stringify(relationship.metadata);
}

function relationshipFromRow(row: Row): PersistedRelationship {
  const metadata = metadataFromRow(row, "metadata");
  return {
    type: colString(row, "type") ?? "",
    sourceId: colString(row, "source_id") as NodeId,
    targetId: colString(row, "target_id") as NodeId,
    ...(metadata !== undefined ? { metadata } : {}),
  };
}
