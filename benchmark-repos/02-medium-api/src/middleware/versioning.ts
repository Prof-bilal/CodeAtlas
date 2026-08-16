import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface ApiVersion {
  version: string;
  deprecated?: boolean;
  sunsetDate?: Date;
}

const supportedVersions: ApiVersion[] = [
  { version: 'v1' },
  { version: 'v2' },
  { version: 'v3', deprecated: true, sunsetDate: new Date('2025-01-01') },
];

export function versioningMiddleware(req: Request, res: Response, next: NextFunction) {
  const version = req.params.version || req.headers['api-version'] as string || 'v1';
  
  const apiVersion = supportedVersions.find(v => v.version === version);
  
  if (!apiVersion) {
    return res.status(400).json({
      error: 'Invalid API Version',
      message: `API version ${version} is not supported`,
      supportedVersions: supportedVersions.map(v => v.version),
    });
  }

  if (apiVersion.deprecated) {
    res.setHeader('X-API-Deprecated', 'true');
    
    if (apiVersion.sunsetDate) {
      res.setHeader('Sunset', apiVersion.sunsetDate.toUTCString());
    }
    
    logger.warn(`Deprecated API version used: ${version}`);
  }

  res.setHeader('X-API-Version', version);
  next();
}
