// Request logging middleware
// DEPRECATED - use structured logging

import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(${req.method}   ms);
  });

  next();
}
