import { SubscriptionRepository } from '../database/repositories/subscriptionRepository.js';
import { eventBus } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';

export interface SubscriptionService {
  getSubscription(id: string): Promise<any>;
  getUserSubscription(userId: string): Promise<any>;
  createSubscription(data: any): Promise<any>;
  cancelSubscription(id: string): Promise<any>;
  renewSubscription(id: string): Promise<any>;
  upgradeSubscription(id: string, newPlanId: string): Promise<any>;
  getExpiringSoon(days?: number): Promise<any[]>;
}

export class SubscriptionServiceImpl implements SubscriptionService {
  private subscriptionRepository: SubscriptionRepository;

  constructor() {
    this.subscriptionRepository = new SubscriptionRepository();
  }

  async getSubscription(id: string): Promise<any> {
    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription) {
      throw new Error('Subscription not found');
    }
    return subscription;
  }

  async getUserSubscription(userId: string): Promise<any> {
    return this.subscriptionRepository.findByUserId(userId);
  }

  async createSubscription(data: any): Promise<any> {
    const subscription = await this.subscriptionRepository.create(data);

    await eventBus.publish('subscription.created', {
      subscriptionId: subscription.id,
      userId: data.userId,
      planId: data.planId,
    }, 'subscription-service');

    return subscription;
  }

  async cancelSubscription(id: string): Promise<any> {
    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const updatedSubscription = await this.subscriptionRepository.cancel(id);

    await eventBus.publish('subscription.canceled', {
      subscriptionId: id,
      userId: subscription.userId,
      reason: 'User requested cancellation',
      effectiveDate: new Date(),
    }, 'subscription-service');

    return updatedSubscription;
  }

  async renewSubscription(id: string): Promise<any> {
    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const newEndDate = new Date(subscription.currentPeriodEnd);
    newEndDate.setMonth(newEndDate.getMonth() + 1);

    const updatedSubscription = await this.subscriptionRepository.update(id, {
      currentPeriodStart: subscription.currentPeriodEnd,
      currentPeriodEnd: newEndDate,
      status: 'active',
    });

    await eventBus.publish('subscription.renewed', {
      subscriptionId: id,
      userId: subscription.userId,
      renewalDate: newEndDate,
    }, 'subscription-service');

    return updatedSubscription;
  }

  async upgradeSubscription(id: string, newPlanId: string): Promise<any> {
    const subscription = await this.subscriptionRepository.findById(id);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const updatedSubscription = await this.subscriptionRepository.update(id, {
      planId: newPlanId,
    });

    await eventBus.publish('subscription.upgraded', {
      subscriptionId: id,
      oldPlanId: subscription.planId,
      newPlanId,
      effectiveDate: new Date(),
    }, 'subscription-service');

    return updatedSubscription;
  }

  async getExpiringSoon(days: number = 7): Promise<any[]> {
    return this.subscriptionRepository.findExpiringSoon(days);
  }
}

export const subscriptionService = new SubscriptionServiceImpl();
