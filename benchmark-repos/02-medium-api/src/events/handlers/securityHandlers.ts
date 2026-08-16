import { EventHandler, Event } from './eventBus.js';
import { logger } from '../utils/logger.js';

export class SecurityAlertHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { alertType, userId, ip, details } = event.data;
    logger.warn(`Security alert: ${alertType} for user ${userId} from ${ip}`);
  }
}

export class SuspiciousActivityHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, activity, ip, riskScore } = event.data;
    logger.warn(`Suspicious activity detected for user ${userId}: ${activity} (risk: ${riskScore})`);
  }
}

export class AccountLockedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, reason, lockedUntil } = event.data;
    logger.warn(`Account locked: ${userId} until ${lockedUntil} - ${reason}`);
  }
}

export class AccountUnlockedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, unlockedBy } = event.data;
    logger.info(`Account unlocked: ${userId} by ${unlockedBy}`);
  }
}

export class PasswordResetRequestHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, email, resetToken, expiresAt } = event.data;
    logger.info(`Password reset requested for user ${userId}`);
  }
}

export class TwoFactorEnabledHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, method } = event.data;
    logger.info(`Two-factor authentication enabled for user ${userId} using ${method}`);
  }
}

export class TwoFactorDisabledHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId } = event.data;
    logger.info(`Two-factor authentication disabled for user ${userId}`);
  }
}

export class ApiKeyCreatedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, keyId, name, permissions } = event.data;
    logger.info(`API key created: ${keyId} for user ${userId}`);
  }
}

export class ApiKeyRevokedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, keyId } = event.data;
    logger.info(`API key revoked: ${keyId} for user ${userId}`);
  }
}
