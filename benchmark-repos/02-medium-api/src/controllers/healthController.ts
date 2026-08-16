import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { healthChecker } from '../utils/health.js';
import { metricsCollector } from '../utils/metrics.js';
import { databaseService } from '../database/databaseService.js';

export const healthController = {
  check: asyncHandler(async (req: Request, res: Response) => {
    const health = await healthChecker.run();
    
    const dbHealthy = await databaseService.healthCheck();
    
    res.json({
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        ...health,
        database: {
          status: dbHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date(),
        },
      },
    });
  }),

  ready: asyncHandler(async (req: Request, res: Response) => {
    const dbHealthy = await databaseService.healthCheck();
    
    if (dbHealthy) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready', reason: 'Database not available' });
    }
  }),

  live: asyncHandler(async (req: Request, res: Response) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
  }),

  metrics: asyncHandler(async (req: Request, res: Response) => {
    const metrics = metricsCollector.getMetrics();
    res.json(metrics);
  }),
};
