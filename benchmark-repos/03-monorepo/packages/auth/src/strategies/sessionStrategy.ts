import { generateToken, hashPassword, verifyPassword } from '@monorepo/shared';

export interface Session {
  id: string;
  userId: string;
  token: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  createdAt: Date;
  lastActiveAt: Date;
  isActive: boolean;
  metadata: Record<string, unknown>;
}

export interface CreateSessionRequest {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  expiresInMs?: number;
  metadata?: Record<string, unknown>;
}

export interface SessionValidationResult {
  valid: boolean;
  session?: Session;
  error?: string;
}

export class SessionStrategy {
  private sessions: Map<string, Session> = new Map();
  private tokenToId: Map<string, string> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  private maxSessionsPerUser: number;

  constructor(maxSessionsPerUser: number = 10) {
    this.maxSessionsPerUser = maxSessionsPerUser;
  }

  createSession(request: CreateSessionRequest): Session {
    const userSessionIds = this.userSessions.get(request.userId) || new Set();
    if (userSessionIds.size >= this.maxSessionsPerUser) {
      const oldestSessionId = Array.from(userSessionIds)[0];
      this.destroySession(oldestSessionId);
    }
    const token = generateToken(48);
    const { hash: tokenHash, salt } = hashPassword(token);
    const session: Session = {
      id: generateToken(24),
      userId: request.userId,
      token: `${tokenHash}:${salt}`,
      userAgent: request.userAgent,
      ipAddress: request.ipAddress,
      expiresAt: new Date(Date.now() + (request.expiresInMs || 24 * 60 * 60 * 1000)),
      createdAt: new Date(),
      lastActiveAt: new Date(),
      isActive: true,
      metadata: request.metadata || {},
    };
    this.sessions.set(session.id, session);
    this.tokenToId.set(token, session.id);
    if (!this.userSessions.has(request.userId)) {
      this.userSessions.set(request.userId, new Set());
    }
    this.userSessions.get(request.userId)!.add(session.id);
    return session;
  }

  validateSession(token: string): SessionValidationResult {
    const sessionId = this.tokenToId.get(token);
    if (!sessionId) {
      return { valid: false, error: 'Invalid session token' };
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { valid: false, error: 'Session not found' };
    }
    if (!session.isActive) {
      return { valid: false, error: 'Session is inactive' };
    }
    if (new Date(session.expiresAt) < new Date()) {
      session.isActive = false;
      return { valid: false, error: 'Session has expired' };
    }
    const [hash, salt] = session.token.split(':');
    if (!verifyPassword(token, hash, salt)) {
      return { valid: false, error: 'Invalid session token' };
    }
    session.lastActiveAt = new Date();
    return { valid: true, session };
  }

  destroySession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.isActive = false;
    this.sessions.delete(sessionId);
    this.userSessions.get(session.userId)?.delete(sessionId);
    return true;
  }

  destroyAllUserSessions(userId: string): number {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return 0;
    let count = 0;
    for (const sessionId of Array.from(sessionIds)) {
      this.destroySession(sessionId);
      count++;
    }
    return count;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getUserSessions(userId: string): Session[] {
    const sessionIds = this.userSessions.get(userId) || new Set();
    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is Session => s !== undefined && s.isActive);
  }

  extendSession(sessionId: string, extendMs: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return false;
    session.expiresAt = new Date(session.expiresAt.getTime() + extendMs);
    return true;
  }

  cleanupExpiredSessions(): number {
    const now = new Date();
    let count = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (new Date(session.expiresAt) < now) {
        this.destroySession(id);
        count++;
      }
    }
    return count;
  }

  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(s => s.isActive).length;
  }

  getActiveSessionCountByUser(userId: string): number {
    return this.getUserSessions(userId).length;
  }
}
