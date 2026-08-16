import { Request, Response, NextFunction } from 'express';
import { auditService } from '../core/audit/auditService.js';

export function auditMiddleware(action: string, resource: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const originalSend = res.send;
    
    res.send = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        auditService.log({
          userId: req.user?.id || null,
          action,
          resource,
          resourceId: req.params.id,
          changes: req.body,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        }).catch(console.error);
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  };
}
