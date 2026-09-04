// Routes V1.15 - DEPRECATED

import { Router } from 'express';

const router15 = Router();

router15.get('/', (req, res) => {
  res.json({ route: 15, version: 'V1' });
});

router15.get('/:id', (req, res) => {
  res.json({ route: 15, id: req.params.id });
});

router15.post('/', (req, res) => {
  res.status(201).json({ route: 15, created: true });
});

export default router15;
