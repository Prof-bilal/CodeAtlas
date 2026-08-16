import { Router, Request, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { searchService } from '../services/searchService.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/',
  authMiddleware,
  [
    query('q').isString().notEmpty(),
    query('type').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

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
);

router.post('/reindex',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const count = await searchService.reindexAll(req.body.type);
      res.json({ reindexed: count });
    } catch (error) {
      logger.error('Error reindexing:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.delete('/document/:documentId',
  authMiddleware,
  [param('documentId').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      await searchService.deleteDocument(req.params.documentId);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting document:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/index',
  authMiddleware,
  async (req: Request, res: Response) => {
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
);

export default router;
