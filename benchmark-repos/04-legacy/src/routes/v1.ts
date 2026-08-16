// Routes v1 - DEPRECATED

import { Router } from 'express';
import { handleLogin, handleRegister } from '../controllers/auth';
import { getUsers, getUser } from '../controllers/users';

const router = Router();

router.post('/auth/login', handleLogin);
router.post('/auth/register', handleRegister);
router.get('/users', getUsers);
router.get('/users/:id', getUser);

export default router;
