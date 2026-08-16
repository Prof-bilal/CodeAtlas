// User management - basic version
// DEPRECATED 2024-02 - use userService.ts instead

import type { Database } from './database/connection';
import { hashPassword } from './auth';
import { Logger } from './utils';

interface BasicUser {
  id: number;
  username: string;
  email: string;
  password: string;
  role: string;
  created: string;
}

export async function createUser(
  db: Database,
  username: string,
  email: string,
  password: string
): Promise<BasicUser> {
  const hashedPassword = hashPassword(password);

  const result = await db.query(
    'INSERT INTO users (username, email, password, role, created) VALUES (?, ?, ?, ?, ?)',
    [username, email, hashedPassword, 'user', new Date().toISOString()]
  ) as any;

  Logger.info(`User created: ${username}`);

  return {
    id: result.insertId,
    username,
    email,
    password: hashedPassword,
    role: 'user',
    created: new Date().toISOString(),
  };
}

export async function findUserByEmail(db: Database, email: string): Promise<BasicUser | null> {
  const results = await db.query(
    'SELECT * FROM users WHERE email = ?',
    [email]
  ) as BasicUser[];

  return results.length > 0 ? results[0] : null;
}

export async function findUserByUsername(db: Database, username: string): Promise<BasicUser | null> {
  const results = await db.query(
    'SELECT * FROM users WHERE username = ?',
    [username]
  ) as BasicUser[];

  return results.length > 0 ? results[0] : null;
}

export async function updateUserRole(db: Database, userId: number, role: string): Promise<boolean> {
  await db.query(
    'UPDATE users SET role = ? WHERE id = ?',
    [role, userId]
  );
  return true;
}

export async function deleteUser(db: Database, userId: number): Promise<boolean> {
  await db.query('DELETE FROM users WHERE id = ?', [userId]);
  Logger.warn(`User deleted: ${userId}`);
  return true;
}
