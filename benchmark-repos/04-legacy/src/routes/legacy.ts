// Legacy routes
// DO NOT MODIFY - used by old mobile app

import { Router } from 'express';
import { legacyLogin, legacyValidate } from '../legacy/auth';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const session = legacyLogin(username, password);
  if (!session) return res.status(401).json({ error: 'Auth failed' });
  res.json(session);
});

router.get('/validate', (req, res) => {
  const token = req.headers['x-token'] as string;
  const session = legacyValidate(token);
  if (!session) return res.status(401).json({ error: 'Invalid' });
  res.json(session);
});

export default router;
