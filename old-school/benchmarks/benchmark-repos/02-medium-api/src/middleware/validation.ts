import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors,
      });
      return;
    }
    
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors,
      });
      return;
    }
    
    req.query = result.data as any;
    next();
  };
}

export function validateParams(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors,
      });
      return;
    }
    
    req.params = result.data as any;
    next();
  };
}
