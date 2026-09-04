// Database connection - CURRENT
// This is the active database connection

import { Database } from 'node:sqlite';

let db: Database | null = null;

export function getDatabase(): Database {
  if (!db) {
    db = new Database(':memory:');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db: Database) {
  db.exec(
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      mfa_enabled INTEGER DEFAULT 0,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      refresh_token TEXT,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'usd',
      description TEXT,
      status TEXT DEFAULT 'pending',
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  );
}

export class DatabaseWrapper {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    return this.db.prepare(sql).all(...params);
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
}
