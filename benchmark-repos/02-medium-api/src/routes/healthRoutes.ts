import { Router, Request, Response } from 'express';
import { getPool } from '../config/database.js';
import { getRedisClient } from '../config/redis.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const checks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: await checkDatabase(),
        redis: await checkRedis(),
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
    };

    const allHealthy = Object.values(checks.services).every(s => s.status === 'healthy');
    
    res.status(allHealthy ? 200 : 503).json(checks);
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

router.get('/ready', async (req: Request, res: Response) => {
  try {
    const db = await checkDatabase();
    const redis = await checkRedis();
    
    if (db.status === 'healthy' && redis.status === 'healthy') {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready' });
    }
  } catch (error: any) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

router.get('/live', async (req: Request, res: Response) => {
  res.json({ status: 'alive' });
});

async function checkDatabase(): Promise<{ status: string; latency?: number }> {
  try {
    const pool = getPool();
    const start = Date.now();
    await pool.query('SELECT 1');
    const latency = Date.now() - start;
    
    return { status: 'healthy', latency };
  } catch (error) {
    return { status: 'unhealthy' };
  }
}

async function checkRedis(): Promise<{ status: string; latency?: number }> {
  try {
    const client = getRedisClient();
    const start = Date.now();
    await client.ping();
    const latency = Date.now() - start;
    
    return { status: 'healthy', latency };
  } catch (error) {
    return { status: 'unhealthy' };
  }
}

export default router;
