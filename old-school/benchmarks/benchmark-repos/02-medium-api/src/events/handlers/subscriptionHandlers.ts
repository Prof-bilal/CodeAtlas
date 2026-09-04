import { EventHandler, Event } from './eventBus.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from '../notifications/emailService.js';

export class SubscriptionCreatedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { subscriptionId, userId, planId } = event.data;
    logger.info(`Subscription created: ${subscriptionId} for user ${userId}`);

    await sendEmail({
      to: event.metadata?.userEmail || '',
      subject: 'Subscription Activated',
      html: `<p>Your subscription has been activated. Plan: ${planId}</p>`,
    });
  }
}

export class SubscriptionRenewedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { subscriptionId, userId, renewalDate } = event.data;
    logger.info(`Subscription renewed: ${subscriptionId} until ${renewalDate}`);
  }
}

export class SubscriptionCanceledHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { subscriptionId, userId, reason, effectiveDate } = event.data;
    logger.info(`Subscription canceled: ${subscriptionId} effective ${effectiveDate}`);

    await sendEmail({
      to: event.metadata?.userEmail || '',
      subject: 'Subscription Canceled',
      html: `<p>Your subscription has been canceled. It will remain active until ${effectiveDate}.</p>`,
    });
  }
}

export class SubscriptionUpgradedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { subscriptionId, oldPlanId, newPlanId } = event.data;
    logger.info(`Subscription upgraded: ${subscriptionId} from ${oldPlanId} to ${newPlanId}`);

    await sendEmail({
      to: event.metadata?.userEmail || '',
      subject: 'Subscription Upgraded',
      html: `<p>Your subscription has been upgraded from ${oldPlanId} to ${newPlanId}.</p>`,
    });
  }
}

export class SubscriptionDowngradedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { subscriptionId, oldPlanId, newPlanId, effectiveDate } = event.data;
    logger.info(`Subscription downgraded: ${subscriptionId} from ${oldPlanId} to ${newPlanId}`);

    await sendEmail({
      to: event.metadata?.userEmail || '',
      subject: 'Subscription Downgraded',
      html: `<p>Your subscription has been downgraded from ${oldPlanId} to ${newPlanId}. Changes take effect on ${effectiveDate}.</p>`,
    });
  }
}

export class SubscriptionExpiringHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { subscriptionId, userId, expiryDate, daysUntilExpiry } = event.data;
    logger.info(`Subscription expiring: ${subscriptionId} in ${daysUntilExpiry} days`);

    await sendEmail({
      to: event.metadata?.userEmail || '',
      subject: 'Subscription Expiring Soon',
      html: `<p>Your subscription will expire in ${daysUntilExpiry} days on ${expiryDate}. Please renew to avoid service interruption.</p>`,
    });
  }
}
