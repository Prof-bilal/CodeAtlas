// Routes V1.13 - API routes

import { Router } from 'express';

const router13 = Router();

router13.get('/', (req, res) => {
  res.json({ route: 13, version: 'V1' });
});

router13.get('/:id', (req, res) => {
  res.json({ route: 13, id: req.params.id });
});

router13.post('/', (req, res) => {
  res.status(201).json({ route: 13, created: true });
});

export default router13;
