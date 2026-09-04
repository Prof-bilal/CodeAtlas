import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { EventBus } from '../../events/eventBus.js';
import { cacheService } from '../../services/cacheService.js';

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubscriptionDTO {
  userId: string;
  planId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
}

export const PLANS: Plan[] = [
  { id: 'free', name: 'Free', price: 0, interval: 'month', features: ['5 tasks', '1 user'] },
  { id: 'pro', name: 'Pro', price: 999, interval: 'month', features: ['Unlimited tasks', '5 users', 'Priority support'] },
  { id: 'enterprise', name: 'Enterprise', price: 4999, interval: 'month', features: ['Unlimited everything', 'Custom integrations', 'Dedicated support'] },
];

export class SubscriptionService {
  private subscriptions: Subscription[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async createSubscription(data: CreateSubscriptionDTO): Promise<Subscription> {
    const subscription: Subscription = {
      id: uuidv4(),
      userId: data.userId,
      planId: data.planId,
      status: 'active',
      currentPeriodStart: new Date(data.currentPeriodStart),
      currentPeriodEnd: new Date(data.currentPeriodEnd),
      cancelAtPeriodEnd: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.subscriptions.push(subscription);
    await cacheService.invalidate(`subscription:${data.userId}`);
    this.eventBus.emit('subscription:created', { subscription });

    return subscription;
  }

  async getSubscription(id: string): Promise<Subscription> {
    const subscription = this.subscriptions.find(s => s.id === id);
    if (!subscription) {
      throw new Error('Subscription not found');
    }
    return subscription;
  }

  async getUserSubscription(userId: string): Promise<Subscription | null> {
    return this.subscriptions.find(s => s.userId === userId && s.status === 'active') || null;
  }

  async cancelSubscription(id: string): Promise<Subscription> {
    const subscription = await this.getSubscription(id);
    subscription.status = 'canceled';
    subscription.cancelAtPeriodEnd = true;
    subscription.updatedAt = new Date();

    await cacheService.invalidate(`subscription:${subscription.userId}`);
    this.eventBus.emit('subscription:canceled', { subscription });

    return subscription;
  }

  async renewSubscription(id: string): Promise<Subscription> {
    const subscription = await this.getSubscription(id);
    subscription.status = 'active';
    subscription.currentPeriodStart = new Date();
    subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    subscription.cancelAtPeriodEnd = false;
    subscription.updatedAt = new Date();

    await cacheService.invalidate(`subscription:${subscription.userId}`);
    this.eventBus.emit('subscription:renewed', { subscription });

    return subscription;
  }

  async upgradeSubscription(id: string, newPlanId: string): Promise<Subscription> {
    const subscription = await this.getSubscription(id);
    subscription.planId = newPlanId;
    subscription.updatedAt = new Date();

    await cacheService.invalidate(`subscription:${subscription.userId}`);
    this.eventBus.emit('subscription:upgraded', { subscription, newPlanId });

    return subscription;
  }

  async downgradeSubscription(id: string, newPlanId: string): Promise<Subscription> {
    const subscription = await this.getSubscription(id);
    subscription.planId = newPlanId;
    subscription.updatedAt = new Date();

    await cacheService.invalidate(`subscription:${subscription.userId}`);
    this.eventBus.emit('subscription:downgraded', { subscription, newPlanId });

    return subscription;
  }

  async getExpiringSoon(days: number): Promise<Subscription[]> {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.subscriptions.filter(s => 
      s.status === 'active' && 
      s.currentPeriodEnd <= cutoff &&
      !s.cancelAtPeriodEnd
    );
  }

  async getPlanById(planId: string): Promise<Plan | null> {
    return PLANS.find(p => p.id === planId) || null;
  }
}

export const subscriptionService = new SubscriptionService(new EventBus());
