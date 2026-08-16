import { EventHandler, Event } from './eventBus.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from '../notifications/emailService.js';

export class UserRegisteredHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, email, name } = event.data;
    logger.info(`User registered: ${userId}`);

    await sendEmail({
      to: email,
      subject: 'Welcome to Our Platform!',
      html: `<h1>Welcome ${name}!</h1><p>Thank you for registering.</p>`,
    });
  }
}

export class UserUpdatedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, changes } = event.data;
    logger.info(`User updated: ${userId}`, changes);
  }
}

export class UserDeletedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId } = event.data;
    logger.info(`User deleted: ${userId}`);
  }
}

export class PasswordChangedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, email } = event.data;
    logger.info(`Password changed for user: ${userId}`);

    await sendEmail({
      to: email,
      subject: 'Password Changed',
      html: `<p>Your password has been changed. If this wasn't you, please contact support.</p>`,
    });
  }
}

export class LoginSuccessHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, ip, userAgent } = event.data;
    logger.info(`Login success for user: ${userId} from ${ip}`);
  }
}

export class LoginFailedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { email, ip, reason } = event.data;
    logger.warn(`Login failed for ${email} from ${ip}: ${reason}`);
  }
}
