// Feature handlers v1 - payments
// DEPRECATED - use v2

import { Request, Response } from 'express';
import { createPayment, getPayment, refundPayment } from '../../../payments';
import { Database } from '../../../database/connection';

let db: Database;

export function init(dbConn: Database) {
  db = dbConn;
}

export async function handleCreatePayment(req: Request, res: Response) {
  const { userId, amount, currency } = req.body;

  if (!userId || !amount) {
    return res.status(400).json({ error: 'userId and amount required' });
  }

  try {
    const payment = await createPayment(userId, amount, currency);
    res.status(201).json({ payment });
  } catch (err) {
    res.status(500).json({ error: 'Payment creation failed' });
  }
}

export async function handleGetPayment(req: Request, res: Response) {
  const { id } = req.params;
  const payment = await getPayment(id);

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  res.json({ payment });
}

export async function handleRefund(req: Request, res: Response) {
  const { id } = req.params;

  const success = await refundPayment(id);

  if (!success) {
    return res.status(400).json({ error: 'Refund failed' });
  }

  res.json({ success: true });
}

// V1 used different response format
export function formatPaymentResponse(payment: any) {
  return {
    id: payment.id,
    amount: payment.amount,
    status: payment.status,
  };
}
