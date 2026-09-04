// Controller 28V2 - Route controller

import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils';

export class Controller28V2 {
  async handle(req: Request, res: Response, next: NextFunction) {
    try {
      Logger.info(Controller 28V2:  );

      const result = {
        controller: 28,
        version: '',
        method: req.method,
        timestamp: new Date(),
      };

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async validate(req: Request, res: Response, next: NextFunction) {
    next();
  }

  async transform(data: any): Promise<any> {
    return data;
  }
}
