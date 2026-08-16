// Routes V2.6 - DEPRECATED

import { Router } from 'express';

const router6 = Router();

router6.get('/', (req, res) => {
  res.json({ route: 6, version: 'V2' });
});

router6.get('/:id', (req, res) => {
  res.json({ route: 6, id: req.params.id });
});

router6.post('/', (req, res) => {
  res.status(201).json({ route: 6, created: true });
});

export default router6;
