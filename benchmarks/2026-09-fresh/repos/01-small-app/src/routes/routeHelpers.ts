import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

type AsyncRouteHandler = (req: Request, res: Response) => Promise<void>;

export function wrapAsync(handler: AsyncRouteHandler) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  };
}

export function asyncHandler(handler: AsyncRouteHandler) {
  return wrapAsync(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    await handler(req, res);
  });
}

export function checkValidation(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}
