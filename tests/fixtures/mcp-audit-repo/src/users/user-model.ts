import type { EntityId } from "../utils/id";

export interface User {
  id: EntityId;
  email: string;
  passwordHash: string;
  status: UserStatus;
}

export enum UserStatus {
  Active = "active",
  Locked = "locked",
  PendingReset = "pending-reset",
}

export type PublicUser = Pick<User, "id" | "email" | "status">;
