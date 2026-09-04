// Routes V2.4 - API routes

import { Router } from 'express';

const router4 = Router();

router4.get('/', (req, res) => {
  res.json({ route: 4, version: 'V2' });
});

router4.get('/:id', (req, res) => {
  res.json({ route: 4, id: req.params.id });
});

router4.post('/', (req, res) => {
  res.status(201).json({ route: 4, created: true });
});

export default router4;
