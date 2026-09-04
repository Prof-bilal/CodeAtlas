import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    stripeClient = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
      typescript: true,
    });
  }
  return stripeClient;
}

export const stripeConfig = {
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  defaultCurrency: 'usd',
  paymentMethods: ['card'] as Stripe.PaymentMethod[],
};
