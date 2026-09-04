import { Router } from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import taskRoutes from './taskRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import subscriptionRoutes from './subscriptionRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import fileRoutes from './fileRoutes.js';
import webhookRoutes from './webhookRoutes.js';
import searchRoutes from './searchRoutes.js';
import auditRoutes from './auditRoutes.js';
import apiKeyRoutes from './apiKeyRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tasks', taskRoutes);
router.use('/payments', paymentRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/notifications', notificationRoutes);
router.use('/files', fileRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/search', searchRoutes);
router.use('/audit', auditRoutes);
router.use('/api-keys', apiKeyRoutes);

export default router;
