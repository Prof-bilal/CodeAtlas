import { Result, Ok, Err, Logger } from '@atlas/shared';

const logger = new Logger({ context: 'MobileCampaigndevice37' });

export class MobileCampaignDevice37 {
  private offlineQueue: unknown[] = [];
  private syncTimestamp = new Date(0);

  async execute(input: Record<string, unknown>): Promise<Result<unknown>> {
    try {
      logger.debug('Executing mobile device');
      const result = await this.process(input);
      return Ok(result);
    } catch (error) {
      logger.error('Failed', error as Error);
      this.offlineQueue.push(input);
      return Err(error as Error);
    }
  }

  private async process(input: Record<string, unknown>): Promise<unknown> {
    return { processed: true, offline: false, timestamp: new Date().toISOString() };
  }

  async syncPending(): Promise<number> {
    const count = this.offlineQueue.length;
    this.offlineQueue = [];
    this.syncTimestamp = new Date();
    return count;
  }

  getOfflineQueueSize(): number { return this.offlineQueue.length; }
  getLastSync(): Date { return this.syncTimestamp; }
}