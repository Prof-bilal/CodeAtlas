import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requestLogger } from '../../src/middleware/requestLogger.js';

describe('RequestLogger', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = { method: 'GET', path: '/test', correlationId: 'test-id' };
    mockRes = {
      statusCode: 200,
      on: vi.fn(),
    };
    mockNext = vi.fn();
  });

  it('should call next', () => {
    requestLogger(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
