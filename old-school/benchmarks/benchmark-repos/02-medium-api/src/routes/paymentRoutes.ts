import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { paymentService } from '../services/paymentService.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const payments = await paymentService.getPaymentsByUser(req.user.id);
    res.json(payments);
  } catch (error) {
    logger.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/total', authMiddleware, async (req: Request, res: Response) => {
  try {
    const total = await paymentService.getTotalByUser(req.user.id);
    res.json({ total });
  } catch (error) {
    logger.error('Error fetching total:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/:id', 
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const payment = await paymentService.getPayment(req.params.id);
      res.json(payment);
    } catch (error) {
      logger.error('Error fetching payment:', error);
      res.status(404).json({ error: 'Payment not found' });
    }
  }
);

router.post('/',
  authMiddleware,
  [
    body('amount').isInt({ min: 1 }),
    body('currency').optional().isString().isLength({ min: 3, max: 3 }),
    body('paymentMethod').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const payment = await paymentService.createPayment({
        ...req.body,
        userId: req.user.id,
      });
      res.status(201).json(payment);
    } catch (error) {
      logger.error('Error creating payment:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/:id/process',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const payment = await paymentService.processPayment(req.params.id);
      res.json(payment);
    } catch (error) {
      logger.error('Error processing payment:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.post('/:id/refund',
  authMiddleware,
  [
    param('id').isUUID(),
    body('amount').optional().isInt({ min: 1 }),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const payment = await paymentService.refundPayment(req.params.id, req.body.amount);
      res.json(payment);
    } catch (error) {
      logger.error('Error refunding payment:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
