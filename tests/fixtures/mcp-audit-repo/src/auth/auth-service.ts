import { AuditService } from "../services/audit-service";
import { UserStatus } from "../users/user-model";
import { UserRepository } from "../users/user-repository";
import { PasswordResetService } from "./password-reset";
import { SessionStore, type Session } from "./session";

export interface LoginResult {
  ok: boolean;
  session?: Session;
  reason?: string;
}

export class AuthService {
  public constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
    private readonly resets: PasswordResetService,
    private readonly audit: AuditService,
  ) {}

  public authenticateUser(email: string, passwordHash: string): LoginResult {
    const user = this.users.findByEmail(email);
    if (user === undefined) {
      return { ok: false, reason: "missing-user" };
    }
    if (user.status === UserStatus.Locked) {
      return { ok: false, reason: "locked-user" };
    }
    if (user.passwordHash !== passwordHash) {
      return { ok: false, reason: "bad-password" };
    }

    const session = this.sessions.createSession(user.id);
    this.audit.record({ actorId: user.id, action: "login", subjectId: session.id });
    return { ok: true, session };
  }

  public requestPasswordReset(email: string): boolean {
    return this.resets.createResetToken(email) !== undefined;
  }
}

export function authenticate(email: string, passwordHash: string, service: AuthService): LoginResult {
  return service.authenticateUser(email, passwordHash);
}
