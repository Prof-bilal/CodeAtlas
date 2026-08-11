import type { DatabaseSync } from "node:sqlite";
import type { SourceFile } from "@atlas/core";
import type { FilePath } from "@atlas/shared";
import { colNumber, colString, count, type Row } from "./row";

/** A `Files` row, mapped back to the source-file shape plus its id. */
export interface FileRow {
  readonly id: number;
  readonly path: FilePath;
  readonly language: string;
  readonly content: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** CRUD for the `Files` table. Symbols reference `Files.id`. */
export class FileRepository {
  public constructor(private readonly db: DatabaseSync) {}

  /** Upsert a file by path and return its row id. */
  public upsert(file: SourceFile): number {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO Files (path, language, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           language = excluded.language,
           content = excluded.content,
           updated_at = excluded.updated_at`,
      )
      .run(file.path, file.language, file.content, now, now);
    return this.idByPath(file.path) ?? 0;
  }

  public idByPath(path: string): number | undefined {
    const row = this.db.prepare("SELECT id FROM Files WHERE path = ?").get(path) as Row | undefined;
    return row === undefined ? undefined : colNumber(row, "id");
  }

  public findByPath(path: string): FileRow | undefined {
    const row = this.db.prepare("SELECT * FROM Files WHERE path = ?").get(path) as Row | undefined;
    return row === undefined ? undefined : fileRow(row);
  }

  public all(): FileRow[] {
    return (this.db.prepare("SELECT * FROM Files ORDER BY path").all() as Row[]).map(fileRow);
  }

  public deleteByPath(path: string): number {
    return count(this.db.prepare("DELETE FROM Files WHERE path = ?").run(path).changes);
  }

  public clear(): number {
    return count(this.db.prepare("DELETE FROM Files").run().changes);
  }
}

function fileRow(row: Row): FileRow {
  return {
    id: colNumber(row, "id"),
    path: colString(row, "path") as FilePath,
    language: colString(row, "language") ?? "",
    content: colString(row, "content") ?? "",
    createdAt: colString(row, "created_at") ?? "",
    updatedAt: colString(row, "updated_at") ?? "",
  };
}
