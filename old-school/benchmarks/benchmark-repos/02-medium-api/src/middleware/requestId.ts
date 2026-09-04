import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  next();
}
