// Routes V2.12 - DEPRECATED

import { Router } from 'express';

const router12 = Router();

router12.get('/', (req, res) => {
  res.json({ route: 12, version: 'V2' });
});

router12.get('/:id', (req, res) => {
  res.json({ route: 12, id: req.params.id });
});

router12.post('/', (req, res) => {
  res.status(201).json({ route: 12, created: true });
});

export default router12;
