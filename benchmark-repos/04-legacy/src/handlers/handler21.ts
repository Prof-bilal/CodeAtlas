// Handler 21 - DEPRECATED

import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils';

export async function handler21(req: Request, res: Response, next: NextFunction) {
  try {
    Logger.info(Handler 21 called:  );

    const result = {
      handler: 21,
      method: req.method,
      path: req.path,
      timestamp: new Date(),
    };

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function handler21_validate(req: Request, res: Response, next: NextFunction) {
  // Validation logic
  next();
}
