// Routes V2.10 - API routes

import { Router } from 'express';

const router10 = Router();

router10.get('/', (req, res) => {
  res.json({ route: 10, version: 'V2' });
});

router10.get('/:id', (req, res) => {
  res.json({ route: 10, id: req.params.id });
});

router10.post('/', (req, res) => {
  res.status(201).json({ route: 10, created: true });
});

export default router10;
