import type { DatabaseSync } from "node:sqlite";
import type { Symbol, SymbolKind, Visibility } from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";
import { colBoolean, colNumber, colString, count, parseJsonArray, type Row } from "./row";
import { StatementCache } from "./statement-cache";

/** CRUD for the `Symbols` table, joined with `Files` so rehydrated `Symbol`s
 * carry their `filePath`. */
export class SymbolRepository extends StatementCache {
  public constructor(db: DatabaseSync) {
    super(db);
  }

  /** Upsert a symbol bound to a file row id. */
  public upsert(symbol: Symbol, fileId: number): void {
    this.prepare(
      `INSERT INTO Symbols (
         symbol_id, file_id, name, kind, parent_id,
         line_start, col_start, line_end, col_end,
         visibility, exported, modifiers, module_specifier, type_text, documentation
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(symbol_id) DO UPDATE SET
         file_id = excluded.file_id,
         name = excluded.name,
         kind = excluded.kind,
         parent_id = excluded.parent_id,
         line_start = excluded.line_start,
         col_start = excluded.col_start,
         line_end = excluded.line_end,
         col_end = excluded.col_end,
         visibility = excluded.visibility,
         exported = excluded.exported,
         modifiers = excluded.modifiers,
         module_specifier = excluded.module_specifier,
         type_text = excluded.type_text,
         documentation = excluded.documentation`,
    ).run(
      symbol.id,
      fileId,
      symbol.name,
      symbol.kind,
      symbol.parentId,
      symbol.location.startLine,
      symbol.location.startColumn,
      symbol.location.endLine,
      symbol.location.endColumn,
      symbol.visibility,
      symbol.exported ? 1 : 0,
      JSON.stringify(symbol.modifiers),
      symbol.moduleSpecifier,
      symbol.typeText,
      symbol.documentation,
    );
  }

  public deleteBySymbolId(symbolId: SymbolId): number {
    return count(this.prepare("DELETE FROM Symbols WHERE symbol_id = ?").run(symbolId).changes);
  }

  public byFile(fileId: number): Symbol[] {
    return (
      this.prepare(
        `SELECT s.*, f.path AS file_path
         FROM Symbols s JOIN Files f ON f.id = s.file_id
         WHERE s.file_id = ?`,
      ).all(fileId) as Row[]
    ).map(symbolFromRow);
  }

  public all(): Symbol[] {
    return (
      this.prepare(
        `SELECT s.*, f.path AS file_path
         FROM Symbols s JOIN Files f ON f.id = s.file_id
         ORDER BY s.file_id, s.line_start, s.col_start`,
      ).all() as Row[]
    ).map(symbolFromRow);
  }

  public clear(): number {
    return count(this.prepare("DELETE FROM Symbols").run().changes);
  }

  /** Number of stored symbols (lightweight `COUNT` for fast-path reporting). */
  public count(): number {
    const row = this.prepare("SELECT COUNT(*) AS n FROM Symbols").get() as Row | undefined;
    return row === undefined ? 0 : colNumber(row, "n");
  }
}

function symbolFromRow(row: Row): Symbol {
  return {
    id: colString(row, "symbol_id") as SymbolId,
    name: colString(row, "name") ?? "",
    kind: colString(row, "kind") as SymbolKind,
    filePath: colString(row, "file_path") as FilePath,
    location: {
      startLine: colNumber(row, "line_start"),
      startColumn: colNumber(row, "col_start"),
      endLine: colNumber(row, "line_end"),
      endColumn: colNumber(row, "col_end"),
    },
    parentId: colString(row, "parent_id") as SymbolId | null,
    visibility: colString(row, "visibility") as Visibility,
    exported: colBoolean(row, "exported"),
    modifiers: parseJsonArray(colString(row, "modifiers")),
    moduleSpecifier: colString(row, "module_specifier"),
    typeText: colString(row, "type_text"),
    documentation: colString(row, "documentation"),
  };
}
