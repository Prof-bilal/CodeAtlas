// User helper functions
// Mix of utilities that don't belong in UserService

import type { Database } from './database/connection';
import { Logger } from './utils';

// Username validation
export function isValidUsername(username: string): boolean {
  if (!username || username.length < 3 || username.length > 30) return false;
  return /^[a-zA-Z0-9_-]+$/.test(username);
}

// Email normalization
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Generate user-friendly slug from username
export function generateSlug(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Check if username is available
export async function isUsernameAvailable(
  db: Database,
  username: string
): Promise<boolean> {
  const results = await db.query(
    'SELECT id FROM users WHERE username = ?',
    [username]
  ) as any[];
  return results.length === 0;
}

// Check if email is available
export async function isEmailAvailable(
  db: Database,
  email: string
): Promise<boolean> {
  const results = await db.query(
    'SELECT id FROM users WHERE email = ?',
    [normalizeEmail(email)]
  ) as any[];
  return results.length === 0;
}

// Format user for display
export function formatUserForDisplay(user: any): {
  id: string;
  name: string;
  avatar: string;
} {
  return {
    id: user.id,
    name: user.display_name || user.username,
    avatar: user.avatar_url || generateDefaultAvatar(user.username),
  };
}

// Generate default avatar URL
function generateDefaultAvatar(username: string): string {
  const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7'];
  const color = colors[username.charCodeAt(0) % colors.length];
  return `https://ui-avatars.com/api/?name=${username}&background=${color}&color=fff`;
}

// TODO: this is duplicated in validators/user.ts
export function validateEmailFormat(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Used by notification service
export async function getUserPreferences(
  db: Database,
  userId: string
): Promise<Record<string, any>> {
  const results = await db.query(
    'SELECT preferences FROM users WHERE id = ?',
    [userId]
  ) as any[];

  if (results.length === 0) return {};
  return results[0].preferences ? JSON.parse(results[0].preferences) : {};
}
