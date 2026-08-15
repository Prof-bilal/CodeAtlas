import { describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth-service";
import { PasswordResetService } from "../src/auth/password-reset";
import { SessionStore } from "../src/auth/session";
import { AuditService } from "../src/services/audit-service";
import type { Logger } from "../src/services/logger";
import { UserRepository } from "../src/users/user-repository";

const logger: Logger = {
  info: () => undefined,
  warn: () => undefined,
};

describe("AuthService", () => {
  it("authenticates an existing user", () => {
    const users = new UserRepository();
    const user = users.create("Ada@example.com", "hash");
    const service = new AuthService(
      users,
      new SessionStore(),
      new PasswordResetService(users),
      new AuditService(logger),
    );

    const result = service.authenticateUser(user.email, "hash");

    expect(result.ok).toBe(true);
    expect(result.session?.userId).toBe(user.id);
  });
});
