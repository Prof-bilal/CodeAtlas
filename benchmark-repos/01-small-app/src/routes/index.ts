import { Router } from 'express';
import authRoutes from './authRoutes.js';
import taskRoutes from './taskRoutes.js';
import tagRoutes from './tagRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/tasks', taskRoutes);
router.use('/tags', tagRoutes);

export default router;
