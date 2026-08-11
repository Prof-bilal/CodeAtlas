import type { DatabaseSync } from "node:sqlite";

/** The version of the current schema (matches the first migration). */
export const SCHEMA_VERSION = 1;

/**
 * DDL for the context database: the eight entity tables plus helper indexes on
 * the hot read columns. Bumped via migrations; see `MIGRATIONS`.
 */
const V1_DDL = `
CREATE TABLE IF NOT EXISTS Files (
  id         INTEGER PRIMARY KEY,
  path       TEXT NOT NULL UNIQUE,
  language   TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Symbols (
  symbol_id        TEXT PRIMARY KEY,
  file_id          INTEGER NOT NULL REFERENCES Files(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL,
  parent_id        TEXT,
  line_start       INTEGER NOT NULL,
  col_start        INTEGER NOT NULL,
  line_end         INTEGER NOT NULL,
  col_end          INTEGER NOT NULL,
  visibility       TEXT NOT NULL,
  exported         INTEGER NOT NULL DEFAULT 0,
  modifiers        TEXT NOT NULL,
  module_specifier TEXT,
  type_text        TEXT,
  documentation    TEXT
);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON Symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON Symbols(kind);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON Symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_parent ON Symbols(parent_id);

CREATE TABLE IF NOT EXISTS Dependencies (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  kind      TEXT NOT NULL,
  metadata  TEXT,
  PRIMARY KEY (source_id, target_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_dependencies_target ON Dependencies(target_id);

CREATE TABLE IF NOT EXISTS Summaries (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL,
  target        TEXT NOT NULL,
  overview      TEXT NOT NULL,
  key_points    TEXT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  prompt        TEXT,
  cache_hit     INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens  INTEGER NOT NULL,
  generated_at  TEXT NOT NULL,
  UNIQUE (kind, target)
);
CREATE INDEX IF NOT EXISTS idx_summaries_kind_target ON Summaries(kind, target);

CREATE TABLE IF NOT EXISTS Modules (
  id          INTEGER PRIMARY KEY,
  path        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  module_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modules_name ON Modules(name);

CREATE TABLE IF NOT EXISTS Relationships (
  id        INTEGER PRIMARY KEY,
  type      TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata  TEXT,
  UNIQUE (type, source_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON Relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON Relationships(target_id);

CREATE TABLE IF NOT EXISTS Hashes (
  path       TEXT PRIMARY KEY,
  hash       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Apply the v1 schema to a fresh database. */
export function createSchema(db: DatabaseSync): void {
  db.exec(V1_DDL);
}
