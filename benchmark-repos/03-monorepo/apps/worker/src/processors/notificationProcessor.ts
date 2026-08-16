export interface NotificationJob {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  channels: ('in_app' | 'email' | 'push' | 'sms')[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface NotificationResult {
  success: boolean;
  channelsProcessed: string[];
  error?: string;
}

export class NotificationProcessor {
  private processedNotifications: Map<string, NotificationResult> = new Map();
  private channelStats: Record<string, { sent: number; failed: number }> = {
    in_app: { sent: 0, failed: 0 },
    email: { sent: 0, failed: 0 },
    push: { sent: 0, failed: 0 },
    sms: { sent: 0, failed: 0 },
  };

  async processJob(job: NotificationJob): Promise<NotificationResult> {
    try {
      const channelsProcessed: string[] = [];
      for (const channel of job.channels) {
        try {
          await this.sendToChannel(channel, job);
          channelsProcessed.push(channel);
          this.channelStats[channel].sent++;
        } catch {
          this.channelStats[channel].failed++;
        }
      }
      const result: NotificationResult = {
        success: channelsProcessed.length > 0,
        channelsProcessed,
      };
      this.processedNotifications.set(job.id, result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, channelsProcessed: [], error: errorMessage };
    }
  }

  private async sendToChannel(channel: string, job: NotificationJob): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (Math.random() < 0.05) {
      throw new Error(`Failed to send to ${channel}`);
    }
  }

  async sendNotification(
    userId: string,
    type: string,
    title: string,
    message: string,
    channels: ('in_app' | 'email' | 'push' | 'sms')[] = ['in_app']
  ): Promise<NotificationResult> {
    return this.processJob({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      type,
      title,
      message,
      channels,
      priority: 'normal',
      createdAt: new Date(),
    });
  }

  async sendBulk(notifications: Omit<NotificationJob, 'id' | 'createdAt'>[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    for (const notif of notifications) {
      results.push(await this.processJob({
        ...notif,
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        createdAt: new Date(),
      }));
    }
    return results;
  }

  getStats() {
    return {
      totalProcessed: this.processedNotifications.size,
      channels: { ...this.channelStats },
    };
  }

  getNotificationResult(id: string): NotificationResult | undefined {
    return this.processedNotifications.get(id);
  }
}

export function createNotificationProcessor(): NotificationProcessor {
  return new NotificationProcessor();
}
