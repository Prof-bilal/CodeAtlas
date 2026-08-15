import type { PasswordResetService } from "../auth/password-reset";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Delivers email messages. Consumes the password-reset service so a reset
 * request ends up as an email to the requesting user.
 */
export class EmailService {
  public constructor(private readonly resets: PasswordResetService) {}

  public sendPasswordReset(email: string): EmailMessage | undefined {
    const token = this.resets.createResetToken(email);
    if (token === undefined) {
      return undefined;
    }
    return { to: email, subject: "Password reset", body: `Use token ${token}` };
  }
}

export function sendEmail(message: EmailMessage): void {
  void message;
}