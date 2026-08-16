import { Request, Response, NextFunction } from 'express';

export interface IPFilterConfig {
  whitelist?: string[];
  blacklist?: string[];
  trustProxy?: boolean;
}

export function ipFilterMiddleware(config: IPFilterConfig = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = config.trustProxy 
      ? req.headers['x-forwarded-for'] as string || req.ip
      : req.ip;
    
    if (config.blacklist && config.blacklist.includes(ip)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    if (config.whitelist && !config.whitelist.includes(ip)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    next();
  };
}
