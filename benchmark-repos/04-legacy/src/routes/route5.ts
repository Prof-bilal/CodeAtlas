// Routes V1.5 - API routes

import { Router } from 'express';

const router5 = Router();

router5.get('/', (req, res) => {
  res.json({ route: 5, version: 'V1' });
});

router5.get('/:id', (req, res) => {
  res.json({ route: 5, id: req.params.id });
});

router5.post('/', (req, res) => {
  res.status(201).json({ route: 5, created: true });
});

export default router5;
