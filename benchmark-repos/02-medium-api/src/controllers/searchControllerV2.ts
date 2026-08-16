import { Request, Response } from 'express';
import { searchService } from '../services/searchService.js';
import { logger } from '../utils/logger.js';

export class SearchController {
  async search(req: Request, res: Response): Promise<void> {
    try {
      const results = await searchService.search(req.query.q as string, {
        type: req.query.type as string,
        limit: parseInt(req.query.limit as string) || 20,
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(results);
    } catch (error) {
      logger.error('Error performing search:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async reindex(req: Request, res: Response): Promise<void> {
    try {
      const count = await searchService.reindexAll(req.body.type);
      res.json({ reindexed: count });
    } catch (error) {
      logger.error('Error reindexing:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      await searchService.deleteDocument(req.params.documentId);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting document:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async indexDocument(req: Request, res: Response): Promise<void> {
    try {
      await searchService.indexDocument(
        req.body.documentId,
        req.body.type,
        req.body.content,
        req.body.metadata
      );
      res.status(201).json({ success: true });
    } catch (error) {
      logger.error('Error indexing document:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export const searchController = new SearchController();
