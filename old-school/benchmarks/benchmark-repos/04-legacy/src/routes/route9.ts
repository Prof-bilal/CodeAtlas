// Routes V1.9 - DEPRECATED

import { Router } from 'express';

const router9 = Router();

router9.get('/', (req, res) => {
  res.json({ route: 9, version: 'V1' });
});

router9.get('/:id', (req, res) => {
  res.json({ route: 9, id: req.params.id });
});

router9.post('/', (req, res) => {
  res.status(201).json({ route: 9, created: true });
});

export default router9;
