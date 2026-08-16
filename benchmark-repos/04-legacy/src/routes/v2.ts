// Routes v2 - CURRENT

import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { handleLogin, handleRegister, handleRefresh } from '../controllers/authV2';
import { getProfile, updateProfile, searchUsers } from '../controllers/usersV2';

const router = Router();

// Auth routes
router.post('/auth/login', handleLogin);
router.post('/auth/register', handleRegister);
router.post('/auth/refresh', handleRefresh);

// Protected routes
router.get('/users/me', authMiddleware, getProfile);
router.put('/users/me', authMiddleware, updateProfile);
router.get('/users/search', authMiddleware, searchUsers);

export default router;
