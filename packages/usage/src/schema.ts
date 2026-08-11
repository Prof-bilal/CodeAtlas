import type { DatabaseSync } from "node:sqlite";

/** The version of the current usage schema (matches the first migration). */
export const SCHEMA_VERSION = 1;

/**
 * DDL for the usage database: a dedicated, versioned store **owned by the
 * usage module** — it is separate from the context database (`@atlas/storage`),
 * which is never modified by this package.
 *
 * `UsageEvents` stores the normalized tri-state record: every token and cost
 * field carries its provenance (`actual` / `estimated` / `unknown`) so nothing
 * is ever presented as more precise than it is. `task_ref` is an anonymized
 * reference — raw task text, prompts, keys, and provider secrets are never
 * stored.
 */
const V1_DDL = `
CREATE TABLE IF NOT EXISTS UsageEvents (
  id                 TEXT PRIMARY KEY,
  source             TEXT NOT NULL,
  agent              TEXT NOT NULL,
  provider           TEXT NOT NULL,
  model              TEXT,
  session_id         TEXT,
  task_id            TEXT,
  task_ref           TEXT,
  occurred_at        TEXT NOT NULL,
  request_count      INTEGER NOT NULL,
  latency_ms         INTEGER,
  exit_code          INTEGER,
  timed_out          INTEGER NOT NULL DEFAULT 0,

  input_tokens       INTEGER,
  input_tokens_src   TEXT NOT NULL,
  input_tokens_note  TEXT,
  output_tokens      INTEGER,
  output_tokens_src  TEXT NOT NULL,
  output_tokens_note TEXT,
  total_tokens       INTEGER,
  total_tokens_src   TEXT NOT NULL,
  total_tokens_note  TEXT,

  cost_currency      TEXT,
  cost_amount        REAL,
  cost_src           TEXT NOT NULL,
  cost_note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_usage_provider ON UsageEvents(provider);
CREATE INDEX IF NOT EXISTS idx_usage_agent ON UsageEvents(agent);
CREATE INDEX IF NOT EXISTS idx_usage_session ON UsageEvents(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_task ON UsageEvents(task_id);
CREATE INDEX IF NOT EXISTS idx_usage_occurred ON UsageEvents(occurred_at);

CREATE TABLE IF NOT EXISTS Budgets (
  id          TEXT PRIMARY KEY,
  scope_kind  TEXT NOT NULL,
  scope_value TEXT NOT NULL,
  currency    TEXT,
  token_limit INTEGER,
  cost_limit  REAL,
  created_at  TEXT NOT NULL,
  UNIQUE (scope_kind, scope_value)
);

CREATE TABLE IF NOT EXISTS Limits (
  id          TEXT PRIMARY KEY,
  scope_kind  TEXT NOT NULL,
  scope_value TEXT NOT NULL,
  currency    TEXT,
  token_limit INTEGER,
  cost_limit  REAL,
  created_at  TEXT NOT NULL,
  UNIQUE (scope_kind, scope_value)
);
`;

/** Apply the v1 usage schema to a fresh database. */
export function createSchema(db: DatabaseSync): void {
  db.exec(V1_DDL);
}
