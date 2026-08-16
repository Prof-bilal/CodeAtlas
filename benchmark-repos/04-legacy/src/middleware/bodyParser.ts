// Body parser middleware (legacy)
// DEPRECATED - use express.json() directly

import { Request, Response, NextFunction } from 'express';

export function jsonBodyParser(req: Request, res: Response, next: NextFunction) {
  if (req.headers['content-type'] === 'application/json') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        (req as any).body = JSON.parse(body);
        next();
      } catch (err) {
        res.status(400).json({ error: 'Invalid JSON' });
      }
    });
  } else {
    next();
  }
}
