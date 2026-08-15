import { minutesFromNow } from "../utils/date";

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  public createSession(userId: string): Session {
    const session: Session = {
      id: `sess_${userId}`,
      userId,
      expiresAt: minutesFromNow(60),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  public findSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }
}
