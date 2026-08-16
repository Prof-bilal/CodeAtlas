// DEPRECATED 2024-01 - DO NOT USE
// This is the old auth system. Use authV2.ts instead.
// TODO: migrate all callers to authV2 before Q2 2024

import { createHash, randomBytes } from 'crypto';
import { Database } from './database/connection';
import { Logger } from './utils';

interface OldUser {
  id: number;
  username: string;
  password_hash: string;
  email: string;
  created_at: string;
  role: string;
}

interface OldSession {
  userId: number;
  token: string;
  expiresAt: Date;
}

const SECRET_KEY = 'hardcoded-secret-key-do-not-commit'; // TODO: move to env
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

let db: Database;

export function initAuth(database: Database) {
  db = database;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(password + salt).digest('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const verify = createHash('sha256').update(password + salt).digest('hex');
  return hash === verify;
}

export async function login(username: string, password: string): Promise<OldSession | null> {
  Logger.info(`Login attempt for user: ${username}`);

  const user = await db.query(
    'SELECT * FROM users WHERE username = ?',
    [username]
  ) as OldUser[];

  if (user.length === 0) {
    Logger.warn(`Failed login for ${username}`);
    return null;
  }

  if (!verifyPassword(password, user[0].password_hash)) {
    Logger.warn(`Invalid password for ${username}`);
    return null;
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY);

  await db.query(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
    [user[0].id, token, expiresAt.toISOString()]
  );

  return { userId: user[0].id, token, expiresAt };
}

export async function validateToken(token: string): Promise<OldUser | null> {
  const session = await db.query(
    'SELECT * FROM sessions WHERE token = ? AND expires_at > ?',
    [token, new Date().toISOString()]
  ) as OldSession[];

  if (session.length === 0) return null;

  const users = await db.query(
    'SELECT * FROM users WHERE id = ?',
    [session[0].userId]
  ) as OldUser[];

  return users.length > 0 ? users[0] : null;
}

export async function logout(token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token = ?', [token]);
}

// TODO: this function is broken, do not call
export function getPasswordResetToken(userId: number): string {
  return createHash('md5').update(String(userId) + Date.now()).digest('hex');
}
