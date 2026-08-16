import { AppError } from './AppError.js';

export class AuthError extends AppError {
  public readonly reason: AuthErrorReason;

  constructor(message: string, reason: AuthErrorReason = 'UNAUTHORIZED') {
    super(message, 'UNAUTHORIZED', 401, true);
    this.name = 'AuthError';
    this.reason = reason;
    Object.setPrototypeOf(this, AuthError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      reason: this.reason,
    };
  }

  static invalidCredentials(): AuthError {
    return new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  static tokenExpired(): AuthError {
    return new AuthError('Token has expired', 'TOKEN_EXPIRED');
  }

  static tokenInvalid(): AuthError {
    return new AuthError('Invalid token', 'TOKEN_INVALID');
  }

  static tokenRevoked(): AuthError {
    return new AuthError('Token has been revoked', 'TOKEN_REVOKED');
  }

  static insufficientPermissions(required: string): AuthError {
    return new AuthError(`Insufficient permissions: ${required} required`, 'INSUFFICIENT_PERMISSIONS');
  }

  static accountLocked(): AuthError {
    return new AuthError('Account is locked', 'ACCOUNT_LOCKED');
  }

  static accountSuspended(): AuthError {
    return new AuthError('Account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  static twoFactorRequired(): AuthError {
    return new AuthError('Two-factor authentication required', 'TWO_FACTOR_REQUIRED');
  }

  static twoFactorInvalid(): AuthError {
    return new AuthError('Invalid two-factor code', 'TWO_FACTOR_INVALID');
  }

  static sessionExpired(): AuthError {
    return new AuthError('Session has expired', 'SESSION_EXPIRED');
  }

  static sessionInvalid(): AuthError {
    return new AuthError('Invalid session', 'SESSION_INVALID');
  }

  static apiKeyInvalid(): AuthError {
    return new AuthError('Invalid API key', 'API_KEY_INVALID');
  }

  static apiKeyRevoked(): AuthError {
    return new AuthError('API key has been revoked', 'API_KEY_REVOKED');
  }

  static oauthDenied(): AuthError {
    return new AuthError('OAuth authorization denied', 'OAUTH_DENIED');
  }

  static passwordRequired(): AuthError {
    return new AuthError('Password is required', 'PASSWORD_REQUIRED');
  }

  static passwordTooWeak(): AuthError {
    return new AuthError('Password is too weak', 'PASSWORD_TOO_WEAK');
  }
}

export type AuthErrorReason =
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_REVOKED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'TWO_FACTOR_REQUIRED'
  | 'TWO_FACTOR_INVALID'
  | 'SESSION_EXPIRED'
  | 'SESSION_INVALID'
  | 'API_KEY_INVALID'
  | 'API_KEY_REVOKED'
  | 'OAUTH_DENIED'
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_TOO_WEAK';
