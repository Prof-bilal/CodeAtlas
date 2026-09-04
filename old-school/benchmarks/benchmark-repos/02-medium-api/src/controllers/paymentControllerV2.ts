import { Request, Response } from 'express';
import { paymentService } from '../services/paymentService.js';
import { logger } from '../utils/logger.js';

export class PaymentController {
  async getPayments(req: Request, res: Response): Promise<void> {
    try {
      const payments = await paymentService.getPaymentsByUser(req.user.id);
      res.json(payments);
    } catch (error) {
      logger.error('Error fetching payments:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getPayment(req: Request, res: Response): Promise<void> {
    try {
      const payment = await paymentService.getPayment(req.params.id);
      res.json(payment);
    } catch (error) {
      logger.error('Error fetching payment:', error);
      res.status(404).json({ error: 'Payment not found' });
    }
  }

  async createPayment(req: Request, res: Response): Promise<void> {
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

  async processPayment(req: Request, res: Response): Promise<void> {
    try {
      const payment = await paymentService.processPayment(req.params.id);
      res.json(payment);
    } catch (error) {
      logger.error('Error processing payment:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async refundPayment(req: Request, res: Response): Promise<void> {
    try {
      const payment = await paymentService.refundPayment(req.params.id, req.body.amount, req.body.reason);
      res.json(payment);
    } catch (error) {
      logger.error('Error refunding payment:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getTotal(req: Request, res: Response): Promise<void> {
    try {
      const total = await paymentService.getTotalByUser(req.user.id);
      res.json({ total });
    } catch (error) {
      logger.error('Error fetching total:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getPaymentStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await paymentService.getPaymentStats();
      res.json(stats);
    } catch (error) {
      logger.error('Error fetching payment stats:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export const paymentController = new PaymentController();
