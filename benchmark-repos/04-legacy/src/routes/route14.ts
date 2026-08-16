// Routes V2.14 - API routes

import { Router } from 'express';

const router14 = Router();

router14.get('/', (req, res) => {
  res.json({ route: 14, version: 'V2' });
});

router14.get('/:id', (req, res) => {
  res.json({ route: 14, id: req.params.id });
});

router14.post('/', (req, res) => {
  res.status(201).json({ route: 14, created: true });
});

export default router14;
