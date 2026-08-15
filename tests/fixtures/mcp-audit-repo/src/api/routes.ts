import { AuthService } from "../auth/auth-service";
import { PaymentService } from "../payments/payment-service";
import { UserRepository } from "../users/user-repository";

export interface Route {
  method: "GET" | "POST";
  path: string;
  handler: string;
}

export function createUserRoutes(users: UserRepository): Route[] {
  users.create("admin@example.com", "hash");
  return [
    { method: "GET", path: "/users/:id", handler: "getUser" },
    { method: "POST", path: "/users", handler: "createUser" },
  ];
}

export function createAuthRoutes(auth: AuthService): Route[] {
  auth.requestPasswordReset("admin@example.com");
  return [
    { method: "POST", path: "/login", handler: "login" },
    { method: "POST", path: "/password-reset", handler: "requestPasswordReset" },
  ];
}

export function createPaymentRoutes(payments: PaymentService): Route[] {
  payments.charge({ userId: "usr_admin", amount: 42, currency: "USD" });
  return [{ method: "POST", path: "/payments", handler: "charge" }];
}
