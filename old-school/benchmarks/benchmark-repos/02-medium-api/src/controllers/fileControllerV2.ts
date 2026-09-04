import { Request, Response } from 'express';
import { fileService } from '../services/fileService.js';
import { logger } from '../utils/logger.js';

export class FileController {
  async getFiles(req: Request, res: Response): Promise<void> {
    try {
      const files = await fileService.getUserFiles(req.user.id);
      res.json(files);
    } catch (error) {
      logger.error('Error fetching files:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getFile(req: Request, res: Response): Promise<void> {
    try {
      const file = await fileService.getFile(req.params.id);
      res.json(file);
    } catch (error) {
      logger.error('Error fetching file:', error);
      res.status(404).json({ error: 'File not found' });
    }
  }

  async uploadFile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
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

  async deleteFile(req: Request, res: Response): Promise<void> {
    try {
      await fileService.deleteFile(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting file:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async downloadFile(req: Request, res: Response): Promise<void> {
    try {
      const file = await fileService.getFile(req.params.id);
      res.download(file.path, file.originalName);
    } catch (error) {
      logger.error('Error downloading file:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getStorageUsage(req: Request, res: Response): Promise<void> {
    try {
      const usage = await fileService.getStorageUsage(req.user.id);
      res.json({ usage });
    } catch (error) {
      logger.error('Error fetching storage usage:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export const fileController = new FileController();
