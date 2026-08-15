import type { UserRepository } from "../users/user-repository";
import { hashPassword } from "./password";
import { minutesFromNow } from "../utils/date";
import { createId } from "../utils/id";

export const PASSWORD_RESET_TTL_MINUTES = 30;

interface ResetRecord {
  email: string;
  expiresAt: Date;
  used: boolean;
}

/**
 * Issues and redeems single-use password-reset tokens against the user
 * repository. AuthService delegates reset-token generation to this service,
 * and email delivery consumes it via EmailService.
 */
export class PasswordResetService {
  private readonly tokens = new Map<string, ResetRecord>();

  public constructor(private readonly users: UserRepository) {}

  public createResetToken(email: string): string | undefined {
    const user = this.users.findByEmail(email);
    if (user === undefined) {
      return undefined;
    }
    const token = createId("reset", user.id);
    this.tokens.set(token, {
      email: user.email,
      expiresAt: minutesFromNow(PASSWORD_RESET_TTL_MINUTES),
      used: false,
    });
    return token;
  }

  public redeemResetToken(token: string, newPasswordHash: string): boolean {
    const record = this.tokens.get(token);
    if (record === undefined || record.used) {
      return false;
    }
    if (new Date() > record.expiresAt) {
      this.tokens.delete(token);
      return false;
    }
    record.used = true;
    return this.users.updatePassword(record.email, newPasswordHash);
  }
}

export async function requestPasswordReset(
  email: string,
  users: UserRepository,
): Promise<string | undefined> {
  return new PasswordResetService(users).createResetToken(email);
}

export async function resetPassword(
  token: string,
  newPassword: string,
  users: UserRepository,
): Promise<boolean> {
  return new PasswordResetService(users).redeemResetToken(token, hashPassword(newPassword));
}