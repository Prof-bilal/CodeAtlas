import { AuthService } from "./auth/auth-service";
import { SessionStore } from "./auth/session";
import { PasswordResetService } from "./auth/password-reset";
import { AuditService } from "./services/audit-service";
import { ConsoleLogger } from "./services/logger";
import { UserRepository } from "./users/user-repository";
import { PaymentService } from "./payments/payment-service";
import { PaymentValidator } from "./payments/payment-validator";
import { createAuthRoutes, createPaymentRoutes, createUserRoutes } from "./api/routes";

const logger = new ConsoleLogger();
const users = new UserRepository();
const sessions = new SessionStore();
const resets = new PasswordResetService(users);
const audit = new AuditService(logger);
const auth = new AuthService(users, sessions, resets, audit);
const payments = new PaymentService(new PaymentValidator(), audit);

createUserRoutes(users);
createAuthRoutes(auth);
createPaymentRoutes(payments);