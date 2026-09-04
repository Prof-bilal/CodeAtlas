// Routes V1.1 - API routes

import { Router } from 'express';

const router1 = Router();

router1.get('/', (req, res) => {
  res.json({ route: 1, version: 'V1' });
});

router1.get('/:id', (req, res) => {
  res.json({ route: 1, id: req.params.id });
});

router1.post('/', (req, res) => {
  res.status(201).json({ route: 1, created: true });
});

export default router1;
