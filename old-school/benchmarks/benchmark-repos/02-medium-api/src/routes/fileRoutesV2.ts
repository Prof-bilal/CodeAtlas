import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { fileService } from '../services/fileService.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import multer from 'multer';

const upload = multer({ dest: 'uploads/' });

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const files = await fileService.getUserFiles(req.user.id);
    res.json(files);
  } catch (error) {
    logger.error('Error fetching files:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/storage-usage', authMiddleware, async (req: Request, res: Response) => {
  try {
    const usage = await fileService.getStorageUsage(req.user.id);
    res.json({ usage });
  } catch (error) {
    logger.error('Error fetching storage usage:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/:id', 
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const file = await fileService.getFile(req.params.id);
      res.json(file);
    } catch (error) {
      logger.error('Error fetching file:', error);
      res.status(404).json({ error: 'File not found' });
    }
  }
);

router.post('/upload',
  authMiddleware,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const file = await fileService.uploadFile({
        userId: req.user.id,
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        mimeType: req.file.mimetype,
      });
      res.status(201).json(file);
    } catch (error) {
      logger.error('Error uploading file:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.delete('/:id',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      await fileService.deleteFile(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting file:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.get('/:id/download',
  authMiddleware,
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const file = await fileService.getFile(req.params.id);
      res.download(file.path, file.originalName);
    } catch (error) {
      logger.error('Error downloading file:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
