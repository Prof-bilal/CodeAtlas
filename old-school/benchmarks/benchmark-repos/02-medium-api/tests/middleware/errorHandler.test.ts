import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../src/middleware/errorHandler.js';

describe('ErrorHandler', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should handle operational errors', () => {
    const error = new Error('Not found') as any;
    error.statusCode = 404;
    errorHandler(error, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(404);
  });

  it('should handle unknown errors', () => {
    const error = new Error('Unknown');
    errorHandler(error, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(500);
  });
});
