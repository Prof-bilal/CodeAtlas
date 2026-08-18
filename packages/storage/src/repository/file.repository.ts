import type { SourceFile } from "@atlas/core";
import type { FilePath } from "@atlas/shared";
import { type Row, colNumber, colString, count } from "./row";
import { StatementCache } from "./statement-cache";

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
export class FileRepository extends StatementCache {
  /** Upsert a file by path and return its row id. */
  public upsert(file: SourceFile): number {
    const now = new Date().toISOString();
    this.prepare(
      `INSERT INTO Files (path, language, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         language = excluded.language,
         content = excluded.content,
         updated_at = excluded.updated_at`,
    ).run(file.path, file.language, file.content, now, now);
    return this.idByPath(file.path) ?? 0;
  }

  public idByPath(path: string): number | undefined {
    const row = this.prepare("SELECT id FROM Files WHERE path = ?").get(path) as Row | undefined;
    return row === undefined ? undefined : colNumber(row, "id");
  }

  public findByPath(path: string): FileRow | undefined {
    const row = this.prepare("SELECT * FROM Files WHERE path = ?").get(path) as Row | undefined;
    return row === undefined ? undefined : fileRow(row);
  }

  public all(): FileRow[] {
    return (this.prepare("SELECT * FROM Files ORDER BY path").all() as Row[]).map(fileRow);
  }

  public deleteByPath(path: string): number {
    return count(this.prepare("DELETE FROM Files WHERE path = ?").run(path).changes);
  }

  /** Number of stored files (lightweight `COUNT` for fast-path reporting). */
  public count(): number {
    const row = this.prepare("SELECT COUNT(*) AS n FROM Files").get() as Row | undefined;
    return row === undefined ? 0 : colNumber(row, "n");
  }

  public clear(): number {
    return count(this.prepare("DELETE FROM Files").run().changes);
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
