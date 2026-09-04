import { logger } from '../utils/logger.js';
import { EventBus } from '../events/eventBus.js';
import { jobQueue } from './jobQueue.js';

export interface ReportJob {
  reportId: string;
  format: string;
  recipients: string[];
}

export class ReportProcessor {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async process(job: ReportJob): Promise<void> {
    try {
      logger.info(`Generating report ${job.reportId} in ${job.format} format`);
      // Report generation logic here
      logger.info(`Report ${job.reportId} generated and sent to ${job.recipients.join(', ')}`);
    } catch (error) {
      logger.error(`Failed to generate report ${job.reportId}:`, error);
      throw error;
    }
  }

  async queueReport(reportId: string, format: string, recipients: string[]): Promise<string> {
    const job = await jobQueue.addJob('report', { reportId, format, recipients });
    return job.id;
  }
}

export const reportProcessor = new ReportProcessor(new EventBus());
