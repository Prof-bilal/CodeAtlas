import { Request, Response, NextFunction } from 'express';

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: boolean;
  crossOriginEmbedderPolicy?: boolean;
  crossOriginOpenerPolicy?: boolean;
  crossOriginResourcePolicy?: boolean;
  dnsPrefetchControl?: boolean;
  frameguard?: boolean;
  hidePoweredBy?: boolean;
  hsts?: boolean;
  ieNoOpen?: boolean;
  noSniff?: boolean;
  referrerPolicy?: boolean;
  xssFilter?: boolean;
}

export function securityHeadersMiddleware(config: SecurityHeadersConfig = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (config.hidePoweredBy !== false) {
      res.removeHeader('X-Powered-By');
    }
    
    if (config.xssFilter !== false) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }
    
    if (config.noSniff !== false) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    if (config.frameguard !== false) {
      res.setHeader('X-Frame-Options', 'DENY');
    }
    
    if (config.hsts !== false) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    if (config.contentSecurityPolicy !== false) {
      res.setHeader('Content-Security-Policy', "default-src 'self'");
    }
    
    if (config.referrerPolicy !== false) {
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }
    
    next();
  };
}
