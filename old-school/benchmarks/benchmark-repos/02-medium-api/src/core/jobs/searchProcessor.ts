import { JobQueue } from './jobQueue.js';
import { logger } from '../../utils/logger.js';

export class SearchProcessor {
  private queue: JobQueue;

  constructor() {
    this.queue = new JobQueue('search', { concurrency: 3 });
    this.setupProcessors();
  }

  private setupProcessors(): void {
    this.queue.process('index-document', {
      process: async (job) => {
        const { documentId, type, content, metadata } = job.data;
        logger.info(`Indexing document ${documentId} of type ${type}`);
        
        // Simulate document indexing
        await new Promise(resolve => setTimeout(resolve, 300));
        
        return { 
          indexed: true,
          documentId,
          tokens: content.split(' ').length,
        };
      },
    });

    this.queue.process('reindex-all', {
      process: async (job) => {
        const { type, filters } = job.data;
        logger.info(`Reindexing all documents of type ${type || 'all'}`);
        
        // Simulate reindexing
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        return { 
          reindexed: 1250,
          type: type || 'all',
          completedAt: new Date(),
        };
      },
    });

    this.queue.process('update-search-index', {
      process: async (job) => {
        const { documentId, changes } = job.data;
        logger.info(`Updating search index for document ${documentId}`);
        
        // Simulate index update
        await new Promise(resolve => setTimeout(resolve, 200));
        
        return { updated: true, documentId };
      },
    });

    this.queue.process('delete-from-index', {
      process: async (job) => {
        const { documentId } = job.data;
        logger.info(`Deleting document ${documentId} from search index`);
        
        // Simulate index deletion
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return { deleted: true, documentId };
      },
    });
  }

  async indexDocument(documentId: string, type: string, content: string, metadata?: Record<string, any>): Promise<string> {
    const job = await this.queue.add('index-document', { documentId, type, content, metadata });
    return job.id;
  }

  async reindexAll(type?: string, filters?: Record<string, any>): Promise<string> {
    const job = await this.queue.add('reindex-all', { type, filters });
    return job.id;
  }

  async updateIndex(documentId: string, changes: Record<string, any>): Promise<string> {
    const job = await this.queue.add('update-search-index', { documentId, changes });
    return job.id;
  }

  async deleteFromIndex(documentId: string): Promise<string> {
    const job = await this.queue.add('delete-from-index', { documentId });
    return job.id;
  }

  getStats() {
    return this.queue.getStats();
  }
}

export const searchProcessor = new SearchProcessor();
