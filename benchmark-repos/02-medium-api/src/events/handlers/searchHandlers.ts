import { EventHandler, Event } from './eventBus.js';
import { logger } from '../utils/logger.js';

export class SearchIndexedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { documentId, type, tokens } = event.data;
    logger.info(`Document indexed: ${documentId} of type ${type} with ${tokens} tokens`);
  }
}

export class SearchQueryHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { query, userId, resultsCount, responseTime } = event.data;
    logger.info(`Search query: "${query}" by user ${userId} - ${resultsCount} results in ${responseTime}ms`);
  }
}

export class SearchReindexCompletedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { type, totalDocuments, duration } = event.data;
    logger.info(`Reindex completed for ${type}: ${totalDocuments} documents in ${duration}ms`);
  }
}

export class SearchIndexUpdatedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { documentId, operation } = event.data;
    logger.info(`Search index updated: ${operation} for document ${documentId}`);
  }
}
