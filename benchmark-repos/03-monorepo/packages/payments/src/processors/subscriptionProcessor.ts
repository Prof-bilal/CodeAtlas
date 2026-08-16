export interface SubscriptionPlan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  maxUsers: number;
  maxProjects: number;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'paused';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt?: Date;
  canceledAt?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubscriptionRequest {
  userId: string;
  planId: string;
  paymentMethodId: string;
  trialDays?: number;
}

export interface SubscriptionBillingResult {
  success: boolean;
  invoiceId?: string;
  amount?: number;
  error?: string;
}

export class SubscriptionProcessor {
  private subscriptions: Map<string, Subscription> = new Map();
  private plans: Map<string, SubscriptionPlan> = new Map();
  private billingHistory: Map<string, Array<{ invoiceId: string; amount: number; date: Date }>> = new Map();

  constructor() {
    this.initializeDefaultPlans();
  }

  private initializeDefaultPlans(): void {
    const plans: SubscriptionPlan[] = [
      {
        id: 'plan_starter',
        name: 'Starter',
        amount: 2900,
        currency: 'USD',
        interval: 'month',
        features: ['5 projects', '10 users', '10GB storage'],
        maxUsers: 10,
        maxProjects: 5,
      },
      {
        id: 'plan_professional',
        name: 'Professional',
        amount: 7900,
        currency: 'USD',
        interval: 'month',
        features: ['25 projects', '50 users', '100GB storage', 'Priority support'],
        maxUsers: 50,
        maxProjects: 25,
      },
      {
        id: 'plan_enterprise',
        name: 'Enterprise',
        amount: 19900,
        currency: 'USD',
        interval: 'month',
        features: ['Unlimited projects', 'Unlimited users', '1TB storage', '24/7 support', 'Custom integrations'],
        maxUsers: Infinity,
        maxProjects: Infinity,
      },
    ];
    for (const plan of plans) {
      this.plans.set(plan.id, plan);
    }
  }

  async createSubscription(request: CreateSubscriptionRequest): Promise<Subscription> {
    const plan = this.plans.get(request.planId);
    if (!plan) throw new Error(`Plan ${request.planId} not found`);
    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.interval === 'month') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }
    const subscription: Subscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: request.userId,
      planId: request.planId,
      status: request.trialDays ? 'trialing' : 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialStart: request.trialDays ? now : undefined,
      trialEnd: request.trialDays ? new Date(now.getTime() + request.trialDays * 24 * 60 * 60 * 1000) : undefined,
      createdAt: now,
      updatedAt: now,
    };
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async cancelSubscription(subscriptionId: string, immediate: boolean = false): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);
    if (subscription.status === 'cancelled') throw new Error('Subscription is already cancelled');
    const now = new Date();
    if (immediate) {
      subscription.status = 'cancelled';
      subscription.canceledAt = now;
    } else {
      subscription.cancelAt = subscription.currentPeriodEnd;
    }
    subscription.updatedAt = now;
    return subscription;
  }

  async changePlan(subscriptionId: string, newPlanId: string): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);
    const newPlan = this.plans.get(newPlanId);
    if (!newPlan) throw new Error(`Plan ${newPlanId} not found`);
    subscription.planId = newPlanId;
    subscription.updatedAt = new Date();
    return subscription;
  }

  async processBilling(subscriptionId: string): Promise<SubscriptionBillingResult> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return { success: false, error: 'Subscription not found' };
    }
    if (subscription.status !== 'active') {
      return { success: false, error: `Cannot bill subscription in ${subscription.status} status` };
    }
    const plan = this.plans.get(subscription.planId);
    if (!plan) {
      return { success: false, error: 'Plan not found' };
    }
    const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    if (!this.billingHistory.has(subscriptionId)) {
      this.billingHistory.set(subscriptionId, []);
    }
    this.billingHistory.get(subscriptionId)!.push({
      invoiceId,
      amount: plan.amount,
      date: new Date(),
    });
    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);
    if (plan.interval === 'month') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }
    subscription.currentPeriodStart = subscription.currentPeriodEnd;
    subscription.currentPeriodEnd = periodEnd;
    subscription.updatedAt = now;
    return {
      success: true,
      invoiceId,
      amount: plan.amount,
    };
  }

  getSubscription(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  getUserSubscription(userId: string): Subscription | undefined {
    return Array.from(this.subscriptions.values()).find(
      s => s.userId === userId && s.status !== 'cancelled'
    );
  }

  getPlan(planId: string): SubscriptionPlan | undefined {
    return this.plans.get(planId);
  }

  getAllPlans(): SubscriptionPlan[] {
    return Array.from(this.plans.values());
  }

  getBillingHistory(subscriptionId: string): Array<{ invoiceId: string; amount: number; date: Date }> {
    return this.billingHistory.get(subscriptionId) || [];
  }

  getDaysUntilRenewal(subscriptionId: string): number {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return 0;
    const now = new Date();
    const end = new Date(subscription.currentPeriodEnd);
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  getActiveSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values()).filter(
      s => s.status === 'active' || s.status === 'trialing'
    );
  }

  async pauseSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);
    if (subscription.status !== 'active') throw new Error('Can only pause active subscriptions');
    subscription.status = 'paused';
    subscription.updatedAt = new Date();
    return subscription;
  }

  async resumeSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);
    if (subscription.status !== 'paused') throw new Error('Can only resume paused subscriptions');
    subscription.status = 'active';
    subscription.updatedAt = new Date();
    return subscription;
  }
}
