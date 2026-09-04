// Routes V1.3 - DEPRECATED

import { Router } from 'express';

const router3 = Router();

router3.get('/', (req, res) => {
  res.json({ route: 3, version: 'V1' });
});

router3.get('/:id', (req, res) => {
  res.json({ route: 3, id: req.params.id });
});

router3.post('/', (req, res) => {
  res.status(201).json({ route: 3, created: true });
});

export default router3;
