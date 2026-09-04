import { UserId, Result, Ok, Err, generateId } from '@atlas/shared';
export interface Session { id: string; userId: UserId; token: string; ip: string; expiresAt: Date; lastActivityAt: Date; isActive: boolean; }
export class SessionManager {
  private sessions = new Map<string, Session>();
  private userSessions = new Map<UserId, Set<string>>();
  private maxSessions: number;
  constructor(maxSessions = 10) { this.maxSessions = maxSessions; }
  async createSession(userId: UserId, token: string, ip: string): Promise<Result<Session>> {
    const count = this.userSessions.get(userId)?.size ?? 0;
    if (count >= this.maxSessions) this.evictOldest(userId);
    const now = new Date();
    const session: Session = { id: generateId(), userId, token, ip, expiresAt: new Date(now.getTime() + 3600000), lastActivityAt: now, isActive: true };
    this.sessions.set(session.id, session);
    if (!this.userSessions.has(userId)) this.userSessions.set(userId, new Set());
    this.userSessions.get(userId)!.add(session.id);
    return Ok(session);
  }
  async getSession(id: string): Promise<Result<Session>> {
    const s = this.sessions.get(id);
    if (!s) return Err(new Error('Not found'));
    if (!s.isActive) return Err(new Error('Inactive'));
    if (new Date() > s.expiresAt) { s.isActive = false; return Err(new Error('Expired')); }
    return Ok(s);
  }
  async invalidateSession(id: string): Promise<Result<void>> {
    const s = this.sessions.get(id); if (!s) return Err(new Error('Not found'));
    s.isActive = false; this.userSessions.get(s.userId)?.delete(id); return Ok(undefined);
  }
  async invalidateAllSessions(userId: UserId): Promise<Result<void>> {
    const ids = this.userSessions.get(userId);
    if (ids) { for (const id of ids) { const s = this.sessions.get(id); if (s) s.isActive = false; } ids.clear(); }
    return Ok(undefined);
  }
  private evictOldest(userId: UserId) {
    const ids = this.userSessions.get(userId); if (!ids?.size) return;
    let oldest: Session | null = null;
    for (const id of ids) { const s = this.sessions.get(id); if (s && (!oldest || s.lastActivityAt < oldest.lastActivityAt)) oldest = s; }
    if (oldest) { oldest.isActive = false; ids.delete(oldest.id); this.sessions.delete(oldest.id); }
  }
}