// Routes V2.8 - API routes

import { Router } from 'express';

const router8 = Router();

router8.get('/', (req, res) => {
  res.json({ route: 8, version: 'V2' });
});

router8.get('/:id', (req, res) => {
  res.json({ route: 8, id: req.params.id });
});

router8.post('/', (req, res) => {
  res.status(201).json({ route: 8, created: true });
});

export default router8;
