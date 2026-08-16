// Subscription service - CURRENT

import { Database } from '../database/connection';
import { Redis } from '../integrations/redis';
import { Logger } from '../utils';
import { v4 as uuidv4 } from 'uuid';

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'past_due' | 'unpaid' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt: Date | null;
  cancelledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  limits: Record<string, number>;
  active: boolean;
}

export interface SubscriptionChange {
  id: string;
  subscriptionId: string;
  fromPlanId: string;
  toPlanId: string;
  effectiveDate: Date;
  prorationAmount: number;
  reason: string;
}

export class SubscriptionService {
  private db: Database;
  private redis: Redis;

  constructor(db: Database, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  async createSubscription(input: {
    userId: string;
    planId: string;
    trialDays?: number;
    metadata?: Record<string, any>;
  }): Promise<Subscription> {
    const id = uuidv4();
    const now = new Date();

    const trialEnd = input.trialDays
      ? new Date(now.getTime() + input.trialDays * 24 * 60 * 60 * 1000)
      : null;

    const subscription: Subscription = {
      id,
      userId: input.userId,
      planId: input.planId,
      status: input.trialDays ? 'trialing' : 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      cancelAt: null,
      cancelledAt: null,
      trialStart: input.trialDays ? now : null,
      trialEnd,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    await this.db.query(
      INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, trial_start, trial_end, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
      [id, input.userId, input.planId, subscription.status,
       subscription.currentPeriodStart.toISOString(), subscription.currentPeriodEnd.toISOString(),
       subscription.trialStart?.toISOString() || null, subscription.trialEnd?.toISOString() || null,
       JSON.stringify(subscription.metadata), now.toISOString(), now.toISOString()]
    );

    Logger.info(Subscription created:  for user );

    return subscription;
  }

  async getSubscription(id: string): Promise<Subscription | null> {
    const cached = await this.redis.get(sub:);
    if (cached) return JSON.parse(cached);

    const results = await this.db.query(
      'SELECT * FROM subscriptions WHERE id = ?',
      [id]
    ) as any[];

    if (results.length === 0) return null;

    const subscription = this.mapRow(results[0]);
    await this.redis.setex(sub:, 300, JSON.stringify(subscription));

    return subscription;
  }

  async getUserSubscription(userId: string): Promise<Subscription | null> {
    const results = await this.db.query(
      "SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1",
      [userId]
    ) as any[];

    return results.length > 0 ? this.mapRow(results[0]) : null;
  }

  async changePlan(subscriptionId: string, newPlanId: string, reason: string = 'user_request'): Promise<SubscriptionChange> {
    const subscription = await this.getSubscription(subscriptionId);
    if (!subscription) throw new Error('Subscription not found');

    const change: SubscriptionChange = {
      id: uuidv4(),
      subscriptionId,
      fromPlanId: subscription.planId,
      toPlanId: newPlanId,
      effectiveDate: new Date(),
      prorationAmount: 0, // Calculate based on remaining period
      reason,
    };

    await this.db.query(
      INSERT INTO subscription_changes (id, subscription_id, from_plan_id, to_plan_id, effective_date, proration_amount, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?),
      [change.id, change.subscriptionId, change.fromPlanId, change.toPlanId,
       change.effectiveDate.toISOString(), change.prorationAmount, change.reason]
    );

    // Update subscription
    await this.db.query(
      "UPDATE subscriptions SET plan_id = ?, updated_at = ? WHERE id = ?",
      [newPlanId, new Date().toISOString(), subscriptionId]
    );

    // Invalidate cache
    await this.redis.del(sub:);

    Logger.info(Plan changed:  from  to );

    return change;
  }

  async cancelSubscription(subscriptionId: string, reason: string = 'user_request'): Promise<void> {
    const subscription = await this.getSubscription(subscriptionId);
    if (!subscription) throw new Error('Subscription not found');

    await this.db.query(
      "UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, cancel_at = ?, updated_at = ? WHERE id = ?",
      [new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), subscriptionId]
    );

    await this.redis.del(sub:);

    Logger.info(Subscription cancelled:  - Reason: );
  }

  async reactivateSubscription(subscriptionId: string): Promise<void> {
    await this.db.query(
      "UPDATE subscriptions SET status = 'active', cancelled_at = null, cancel_at = null, updated_at = ? WHERE id = ?",
      [new Date().toISOString(), subscriptionId]
    );

    await this.redis.del(sub:);

    Logger.info(Subscription reactivated: );
  }

  async getPlans(): Promise<Plan[]> {
    const cached = await this.redis.get('plans:all');
    if (cached) return JSON.parse(cached);

    const results = await this.db.query(
      "SELECT * FROM plans WHERE active = true ORDER BY price ASC"
    ) as any[];

    const plans = results.map(this.mapPlanRow);
    await this.redis.setex('plans:all', 3600, JSON.stringify(plans));

    return plans;
  }

  async getPlan(id: string): Promise<Plan | null> {
    const results = await this.db.query(
      'SELECT * FROM plans WHERE id = ?',
      [id]
    ) as any[];

    return results.length > 0 ? this.mapPlanRow(results[0]) : null;
  }

  async checkFeatureAccess(userId: string, feature: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) return false;

    const plan = await this.getPlan(subscription.planId);
    if (!plan) return false;

    return plan.features.includes(feature);
  }

  async getUsageLimits(userId: string): Promise<Record<string, number>> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) return {};

    const plan = await this.getPlan(subscription.planId);
    return plan?.limits || {};
  }

  private mapRow(row: any): Subscription {
    return {
      id: row.id,
      userId: row.user_id,
      planId: row.plan_id,
      status: row.status,
      currentPeriodStart: new Date(row.current_period_start),
      currentPeriodEnd: new Date(row.current_period_end),
      cancelAt: row.cancel_at ? new Date(row.cancel_at) : null,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
      trialStart: row.trial_start ? new Date(row.trial_start) : null,
      trialEnd: row.trial_end ? new Date(row.trial_end) : null,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapPlanRow(row: any): Plan {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price,
      currency: row.currency,
      interval: row.interval,
      features: typeof row.features === 'string' ? JSON.parse(row.features) : row.features,
      limits: typeof row.limits === 'string' ? JSON.parse(row.limits) : row.limits,
      active: row.active,
    };
  }
}
