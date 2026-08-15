import { createId, normalizeEmail } from "../utils/id";
import { UserStatus, type PublicUser, type User } from "./user-model";

export class UserRepository {
  private readonly users = new Map<string, User>();

  public create(email: string, passwordHash: string): User {
    const normalized = normalizeEmail(email);
    const user: User = {
      id: createId("usr", normalized),
      email: normalized,
      passwordHash,
      status: UserStatus.Active,
    };
    this.users.set(user.id, user);
    return user;
  }

  public findByEmail(email: string): User | undefined {
    const normalized = normalizeEmail(email);
    return [...this.users.values()].find((user) => user.email === normalized);
  }

  public findById(id: string): User | undefined {
    return this.users.get(id);
  }

  public updatePassword(email: string, passwordHash: string): boolean {
    const user = this.findByEmail(email);
    if (user === undefined) {
      return false;
    }
    user.passwordHash = passwordHash;
    return true;
  }

  public toPublicUser(user: User): PublicUser {
    return { id: user.id, email: user.email, status: user.status };
  }
}
