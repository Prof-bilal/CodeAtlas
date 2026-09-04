// Routes V1.11 - API routes

import { Router } from 'express';

const router11 = Router();

router11.get('/', (req, res) => {
  res.json({ route: 11, version: 'V1' });
});

router11.get('/:id', (req, res) => {
  res.json({ route: 11, id: req.params.id });
});

router11.post('/', (req, res) => {
  res.status(201).json({ route: 11, created: true });
});

export default router11;
