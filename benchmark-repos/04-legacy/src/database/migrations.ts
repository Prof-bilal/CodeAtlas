// Database migrations
// OLD version - before we had proper migration system

export const migrations = [
  {
    version: 1,
    up: CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE,
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user'
    );,
    down: 'DROP TABLE IF EXISTS users;',
  },
  {
    version: 2,
    up: CREATE TABLE sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      token VARCHAR(255),
      expires_at TIMESTAMP
    );,
    down: 'DROP TABLE IF EXISTS sessions;',
  },
  {
    version: 3,
    up: ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT NOW();,
    down: 'ALTER TABLE users DROP COLUMN created_at;',
  },
  // TODO: migrations 4-10 are missing
];

export async function runMigrations(db: any) {
  for (const migration of migrations) {
    console.log(Running migration );
    await db.query(migration.up);
  }
}
