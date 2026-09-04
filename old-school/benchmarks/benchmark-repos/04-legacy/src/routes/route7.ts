// Routes V1.7 - API routes

import { Router } from 'express';

const router7 = Router();

router7.get('/', (req, res) => {
  res.json({ route: 7, version: 'V1' });
});

router7.get('/:id', (req, res) => {
  res.json({ route: 7, id: req.params.id });
});

router7.post('/', (req, res) => {
  res.status(201).json({ route: 7, created: true });
});

export default router7;
