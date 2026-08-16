// Feature handlers v2 - payments
// CURRENT for v2 API clients
// Last updated: 2024-02-28

import { Request, Response } from 'express';
import { PaymentServiceV2 } from '../../../paymentServiceV2';
import { Database } from '../../../database/connection';
import { Redis } from '../../../integrations/redis';
import { Logger } from '../../../utils';

let paymentService: PaymentServiceV2;

export function initPaymentV2(db: Database, redis: Redis) {
  paymentService = new PaymentServiceV2(db, redis);
}

export async function handleCreatePaymentIntent(req: Request, res: Response) {
  const { amount, currency, description, idempotencyKey } = req.body;
  const userId = (req as any).user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const payment = await paymentService.createPaymentIntent(
      userId,
      amount,
      currency || 'usd',
      description || '',
      idempotencyKey
    );

    res.status(201).json({
      success: true,
      data: {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
      },
    });
  } catch (err: any) {
    Logger.error('Payment intent creation failed:', err);
    res.status(500).json({ error: 'Payment creation failed' });
  }
}

export async function handleConfirmPayment(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const payment = await paymentService.confirmPayment(id);

    res.json({
      success: true,
      data: {
        id: payment.id,
        status: payment.status,
        stripePaymentIntentId: payment.stripePaymentIntentId,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleRefundPayment(req: Request, res: Response) {
  const { id } = req.params;
  const { amount } = req.body;

  try {
    const result = await paymentService.refundPayment(id, amount);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, refundId: result.refundId });
  } catch (err: any) {
    res.status(500).json({ error: 'Refund failed' });
  }
}

export async function handleGetPayments(req: Request, res: Response) {
  const userId = (req as any).user?.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const payments = await paymentService.getUserPayments(userId, page, limit);

  res.json({
    success: true,
    data: payments.map(p => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt,
    })),
  });
}

export async function handleGetPaymentStats(req: Request, res: Response) {
  const userId = (req as any).user?.id;

  const stats = await paymentService.getPaymentStats(userId);

  res.json({ success: true, data: stats });
}
