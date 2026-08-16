import { EventHandler, Event } from './eventBus.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from '../notifications/emailService.js';

export class PaymentSuccessHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { paymentId, userId, amount, currency } = event.data;
    logger.info(`Payment successful: ${paymentId} for ${amount} ${currency}`);

    await sendEmail({
      to: event.metadata?.userEmail || '',
      subject: 'Payment Confirmation',
      html: `<p>Your payment of ${amount} ${currency} has been processed successfully.</p><p>Payment ID: ${paymentId}</p>`,
    });
  }
}

export class PaymentFailedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { paymentId, userId, error } = event.data;
    logger.error(`Payment failed: ${paymentId}`, error);

    await sendEmail({
      to: event.metadata?.userEmail || '',
      subject: 'Payment Failed',
      html: `<p>Your payment could not be processed. Please try again or contact support.</p><p>Payment ID: ${paymentId}</p>`,
    });
  }
}

export class RefundProcessedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { refundId, paymentId, amount, reason } = event.data;
    logger.info(`Refund processed: ${refundId} for payment ${paymentId}`);

    await sendEmail({
      to: event.metadata?.userEmail || '',
      subject: 'Refund Processed',
      html: `<p>A refund of ${amount} has been processed for your payment ${paymentId}.</p><p>Reason: ${reason}</p>`,
    });
  }
}

export class SubscriptionPaymentSuccessHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { subscriptionId, paymentId, amount } = event.data;
    logger.info(`Subscription payment successful: ${paymentId} for subscription ${subscriptionId}`);
  }
}

export class SubscriptionPaymentFailedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { subscriptionId, paymentId, error } = event.data;
    logger.error(`Subscription payment failed: ${paymentId} for subscription ${subscriptionId}`, error);

    await sendEmail({
      to: event.metadata?.userEmail || '',
      subject: 'Subscription Payment Failed',
      html: `<p>Your subscription payment could not be processed. Please update your payment method.</p>`,
    });
  }
}
