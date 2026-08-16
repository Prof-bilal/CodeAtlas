import { EventHandler, Event } from './eventBus.js';
import { logger } from '../utils/logger.js';

export class FileUploadedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { fileId, userId, filename, size, mimeType } = event.data;
    logger.info(`File uploaded: ${filename} (${size} bytes) by user ${userId}`);
  }
}

export class FileDeletedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { fileId, userId, filename } = event.data;
    logger.info(`File deleted: ${filename} by user ${userId}`);
  }
}

export class FileSharedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { fileId, sharedBy, sharedWith, permissions } = event.data;
    logger.info(`File shared: ${fileId} by ${sharedBy} with ${sharedWith}`);
  }
}

export class FileDownloadedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { fileId, userId, filename } = event.data;
    logger.info(`File downloaded: ${filename} by user ${userId}`);
  }
}

export class FileVirusScanCompletedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { fileId, clean, threats, scanEngine } = event.data;
    if (!clean) {
      logger.warn(`Virus detected in file ${fileId}: ${threats} threats found by ${scanEngine}`);
    }
  }
}

export class FileQuotaExceededHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, currentUsage, quota, plan } = event.data;
    logger.warn(`File quota exceeded for user ${userId}: ${currentUsage}/${quota} bytes (${plan} plan)`);
  }
}

export class StorageLimitApproachingHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { userId, currentUsage, limit, percentage } = event.data;
    logger.warn(`Storage limit approaching for user ${userId}: ${percentage}% used`);
  }
}
