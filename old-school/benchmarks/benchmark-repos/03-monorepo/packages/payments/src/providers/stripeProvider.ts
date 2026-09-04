export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  apiVersion: string;
}

export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  clientSecret: string;
  metadata: Record<string, string>;
  created: number;
}

export interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentIntentId: string;
  receiptUrl?: string;
  created: number;
}

export interface StripeRefund {
  id: string;
  amount: number;
  status: string;
  chargeId: string;
  reason?: string;
  created: number;
}

export interface StripeCustomer {
  id: string;
  email: string;
  name?: string;
  metadata: Record<string, string>;
  created: number;
}

export interface StripeSubscription {
  id: string;
  customerId: string;
  status: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  items: StripeSubscriptionItem[];
  created: number;
}

export interface StripeSubscriptionItem {
  id: string;
  priceId: string;
  quantity: number;
}

export interface StripePaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
}

export class StripeProvider {
  private config: StripeConfig;
  private baseUrl = 'https://api.stripe.com/v1';

  constructor(config: StripeConfig) {
    this.config = config;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': this.config.apiVersion,
    };
  }

  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    metadata?: Record<string, string>;
    paymentMethodId?: string;
    customerId?: string;
  }): Promise<StripePaymentIntent> {
    const body = new URLSearchParams();
    body.append('amount', params.amount.toString());
    body.append('currency', params.currency);
    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        body.append(`metadata[${key}]`, value);
      }
    }
    if (params.paymentMethodId) body.append('payment_method', params.paymentMethodId);
    if (params.customerId) body.append('customer', params.customerId);
    body.append('automatic_payment_methods[enabled]', 'true');
    const response = await fetch(`${this.baseUrl}/payment_intents`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body.toString(),
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`Stripe error: ${(error.error as Record<string, string>)?.message || response.statusText}`);
    }
    const data = await response.json() as StripePaymentIntent;
    return data;
  }

  async confirmPaymentIntent(paymentIntentId: string, paymentMethodId: string): Promise<StripePaymentIntent> {
    const body = new URLSearchParams();
    body.append('payment_method', paymentMethodId);
    const response = await fetch(`${this.baseUrl}/payment_intents/${paymentIntentId}/confirm`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body.toString(),
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`Stripe error: ${(error.error as Record<string, string>)?.message || response.statusText}`);
    }
    return response.json() as Promise<StripePaymentIntent>;
  }

  async refundPayment(paymentIntentId: string, amount?: number, reason?: string): Promise<StripeRefund> {
    const body = new URLSearchParams();
    body.append('payment_intent', paymentIntentId);
    if (amount) body.append('amount', amount.toString());
    if (reason) body.append('reason', reason);
    const response = await fetch(`${this.baseUrl}/refunds`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body.toString(),
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`Stripe error: ${(error.error as Record<string, string>)?.message || response.statusText}`);
    }
    return response.json() as Promise<StripeRefund>;
  }

  async createCustomer(email: string, name?: string, metadata?: Record<string, string>): Promise<StripeCustomer> {
    const body = new URLSearchParams();
    body.append('email', email);
    if (name) body.append('name', name);
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        body.append(`metadata[${key}]`, value);
      }
    }
    const response = await fetch(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body.toString(),
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`Stripe error: ${(error.error as Record<string, string>)?.message || response.statusText}`);
    }
    return response.json() as Promise<StripeCustomer>;
  }

  async createSubscription(customerId: string, priceId: string, trialDays?: number): Promise<StripeSubscription> {
    const body = new URLSearchParams();
    body.append('customer', customerId);
    body.append('items[0][price]', priceId);
    if (trialDays) body.append('trial_period_days', trialDays.toString());
    body.append('payment_behavior', 'default_incomplete');
    body.append('expand[]', 'latest_invoice.payment_intent');
    const response = await fetch(`${this.baseUrl}/subscriptions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body.toString(),
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`Stripe error: ${(error.error as Record<string, string>)?.message || response.statusText}`);
    }
    return response.json() as Promise<StripeSubscription>;
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean = true): Promise<StripeSubscription> {
    const body = new URLSearchParams();
    if (atPeriodEnd) {
      body.append('cancel_at_period_end', 'true');
    }
    const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`Stripe error: ${(error.error as Record<string, string>)?.message || response.statusText}`);
    }
    return response.json() as Promise<StripeSubscription>;
  }

  async getPaymentMethod(paymentMethodId: string): Promise<StripePaymentMethod> {
    const response = await fetch(`${this.baseUrl}/payment_methods/${paymentMethodId}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`Stripe error: ${(error.error as Record<string, string>)?.message || response.statusText}`);
    }
    return response.json() as Promise<StripePaymentMethod>;
  }

  constructWebhookEvent(payload: string, signature: string): Record<string, unknown> {
    const elements = signature.split(',').reduce((acc: Record<string, string>, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {});
    return { type: elements.t, data: JSON.parse(payload) };
  }
}
