// Validation middleware
// DEPRECATED - use validators/ directory

import { Request, Response, NextFunction } from 'express';

export function validate(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];

    for (const field of schema.required || []) {
      if (!req.body[field]) {
        errors.push(${field} is required);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    next();
  };
}
