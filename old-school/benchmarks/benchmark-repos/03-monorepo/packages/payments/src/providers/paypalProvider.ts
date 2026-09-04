export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  mode: 'sandbox' | 'live';
}

export interface PayPalOrder {
  id: string;
  status: string;
  intent: string;
  purchaseUnits: PayPalPurchaseUnit[];
  createTime: string;
  updateTime: string;
}

export interface PayPalPurchaseUnit {
  referenceId: string;
  amount: PayPalAmount;
  payee?: PayPalPayee;
  description?: string;
  customId?: string;
}

export interface PayPalAmount {
  currencyCode: string;
  value: string;
  breakdown?: {
    itemTotal?: PayPalAmount;
    shipping?: PayPalAmount;
    taxTotal?: PayPalAmount;
  };
}

export interface PayPalPayee {
  emailAddress: string;
  merchantId?: string;
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount: PayPalAmount;
  finalCapture: boolean;
  sellerProtection?: {
    status: string;
    disputeCategories: string[];
  };
  createTime: string;
  updateTime: string;
}

export interface PayPalRefund {
  id: string;
  status: string;
  amount: PayPalAmount;
  noteToPayer?: string;
  createTime: string;
  updateTime: string;
}

export interface PayPalPayer {
  emailAddress: string;
  name?: {
    givenName: string;
    surname: string;
  };
  payerId: string;
}

export class PayPalProvider {
  private config: PayPalConfig;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: PayPalConfig) {
    this.config = config;
    this.baseUrl = config.mode === 'sandbox'
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) {
      throw new Error('Failed to get PayPal access token');
    }
    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);
    return this.accessToken;
  }

  async createOrder(params: {
    amount: number;
    currency: string;
    description?: string;
    referenceId?: string;
    returnUrl?: string;
    cancelUrl?: string;
  }): Promise<PayPalOrder> {
    const token = await this.getAccessToken();
    const body = {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: params.referenceId || `order_${Date.now()}`,
        amount: {
          currency_code: params.currency,
          value: (params.amount / 100).toFixed(2),
        },
        description: params.description,
      }],
      application_context: {
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    };
    const response = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`PayPal error: ${(error.message as string) || response.statusText}`);
    }
    return response.json() as Promise<PayPalOrder>;
  }

  async captureOrder(orderId: string): Promise<PayPalCapture> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`PayPal error: ${(error.message as string) || response.statusText}`);
    }
    const data = await response.json() as PayPalOrder;
    return {
      id: data.id,
      status: data.status,
      amount: data.purchaseUnits[0].amount,
      finalCapture: true,
      createTime: data.createTime,
      updateTime: data.updateTime,
    };
  }

  async refundCapture(captureId: string, amount?: number, currency?: string, note?: string): Promise<PayPalRefund> {
    const token = await this.getAccessToken();
    const body: Record<string, unknown> = {};
    if (amount !== undefined && currency) {
      body.amount = {
        currency_code: currency,
        value: (amount / 100).toFixed(2),
      };
    }
    if (note) body.note_to_payer = note;
    const response = await fetch(`${this.baseUrl}/v2/payments/captures/${captureId}/refund`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`PayPal error: ${(error.message as string) || response.statusText}`);
    }
    return response.json() as Promise<PayPalRefund>;
  }

  async getOrder(orderId: string): Promise<PayPalOrder> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const error = await response.json() as Record<string, unknown>;
      throw new Error(`PayPal error: ${(error.message as string) || response.statusText}`);
    }
    return response.json() as Promise<PayPalOrder>;
  }

  verifyWebhookSignature(headers: Record<string, string>, body: string): boolean {
    const requiredHeaders = ['paypal-transmission-id', 'paypal-cert-url', 'paypal-signature'];
    return requiredHeaders.every(h => headers[h] !== undefined);
  }
}
