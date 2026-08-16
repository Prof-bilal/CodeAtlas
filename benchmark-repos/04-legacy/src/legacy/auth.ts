// Legacy auth copy - DO NOT MODIFY
// This was copied from auth.ts for the legacy API gateway
// It diverged from the main auth.ts in 2023-09

import { createHash, randomBytes } from 'crypto';

interface LegacySession {
  userId: number;
  token: string;
}

// This is an exact copy of the old auth module but with in-memory storage
// instead of database storage. Used by the legacy REST API.

const memorySessions: Map<string, LegacySession> = new Map();
const memoryUsers = new Map<number, { id: number; username: string; passwordHash: string; role: string }>();

// Seed data for testing
memoryUsers.set(1, { id: 1, username: 'admin', passwordHash: 'legacy-hash-admin', role: 'admin' });
memoryUsers.set(2, { id: 2, username: 'testuser', passwordHash: 'legacy-hash-test', role: 'user' });

export function legacyLogin(username: string, password: string): LegacySession | null {
  for (const user of memoryUsers.values()) {
    if (user.username === username) {
      const token = randomBytes(20).toString('hex');
      memorySessions.set(token, { userId: user.id, token });
      return { userId: user.id, token };
    }
  }
  return null;
}

export function legacyValidate(token: string): LegacySession | null {
  return memorySessions.get(token) || null;
}

export function legacyLogout(token: string): boolean {
  return memorySessions.delete(token);
}

export function legacyRegister(username: string, password: string, role: string = 'user'): { id: number; username: string } {
  const id = memoryUsers.size + 1;
  const passwordHash = createHash('sha256').update(password).digest('hex');
  memoryUsers.set(id, { id, username, passwordHash, role });
  return { id, username };
}

export function legacyGetUser(id: number) {
  return memoryUsers.get(id) || null;
}

// WARNING: admin-only function
export function legacyGetAllUsers() {
  return Array.from(memoryUsers.values()).map(({ passwordHash, ...u }) => u);
}
