import { logger } from '../utils/logger.js';
import { EventBus } from '../events/eventBus.js';
import { jobQueue } from './jobQueue.js';

export interface DataJob {
  type: 'export' | 'import' | 'transform';
  source?: string;
  destination?: string;
  format: string;
}

export class DataProcessor {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async process(job: DataJob): Promise<void> {
    try {
      logger.info(`Processing data job: ${job.type}`);

      switch (job.type) {
        case 'export':
          await this.processExport(job);
          break;
        case 'import':
          await this.processImport(job);
          break;
        case 'transform':
          await this.processTransform(job);
          break;
      }

      logger.info(`Data job ${job.type} completed`);
    } catch (error) {
      logger.error(`Failed to process data job ${job.type}:`, error);
      throw error;
    }
  }

  private async processExport(job: DataJob): Promise<void> {
    logger.info(`Exporting data from ${job.source} to ${job.destination}`);
  }

  private async processImport(job: DataJob): Promise<void> {
    logger.info(`Importing data from ${job.source}`);
  }

  private async processTransform(job: DataJob): Promise<void> {
    logger.info(`Transforming data from ${job.source}`);
  }

  async queueJob(type: DataJob['type'], data: Partial<DataJob>): Promise<string> {
    const job = await jobQueue.addJob('data', { type, ...data });
    return job.id;
  }
}

export const dataProcessor = new DataProcessor(new EventBus());
