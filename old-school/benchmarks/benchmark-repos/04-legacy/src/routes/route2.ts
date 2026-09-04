// Routes V2.2 - API routes

import { Router } from 'express';

const router2 = Router();

router2.get('/', (req, res) => {
  res.json({ route: 2, version: 'V2' });
});

router2.get('/:id', (req, res) => {
  res.json({ route: 2, id: req.params.id });
});

router2.post('/', (req, res) => {
  res.status(201).json({ route: 2, created: true });
});

export default router2;
