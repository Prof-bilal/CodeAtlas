import type { AuthService } from "./auth-service";

export interface HandlerResult {
  ok: boolean;
  status: number;
  body?: Record<string, unknown>;
}

/**
 * Authentication middleware: decides whether a request carrying `token` may
 * proceed. Used by the API layer to protect routes behind a valid session.
 */
export function requireAuth(auth: AuthService, token: string): HandlerResult {
  const result = auth.authenticateUser("user", token);
  if (!result.ok) {
    return { ok: false, status: 401, body: { error: "unauthorized" } };
  }
  return { ok: true, status: 200 };
}

/**
 * Optional authentication: attaches identity when present but never blocks.
 */
export function optionalAuth(authenticated: boolean): HandlerResult {
  return { ok: true, status: 200, body: { authenticated } };
}