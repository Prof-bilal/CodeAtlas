import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { paymentService } from '../services/paymentService.js';
import { logger } from '../utils/logger.js';

export const paymentController = {
  getPayments: asyncHandler(async (req: Request, res: Response) => {
    const payments = await paymentService.getPaymentsByUser(req.user!.id);
    res.json(payments);
  }),

  getPayment: asyncHandler(async (req: Request, res: Response) => {
    const payment = await paymentService.getPayment(req.params.id);
    res.json(payment);
  }),

  createPayment: asyncHandler(async (req: Request, res: Response) => {
    const payment = await paymentService.createPayment({
      ...req.body,
      userId: req.user!.id,
    });
    res.status(201).json(payment);
  }),

  processPayment: asyncHandler(async (req: Request, res: Response) => {
    const payment = await paymentService.processPayment(req.params.id);
    res.json(payment);
  }),

  refundPayment: asyncHandler(async (req: Request, res: Response) => {
    const payment = await paymentService.refundPayment(req.params.id, req.body.amount);
    res.json(payment);
  }),

  getTotalByUser: asyncHandler(async (req: Request, res: Response) => {
    const total = await paymentService.getTotalByUser(req.user!.id);
    res.json({ total });
  }),
};
