import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { correlationIdMiddleware } from '../../src/middleware/correlationId.js';

describe('CorrelationIdMiddleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = { setHeader: vi.fn() };
    mockNext = vi.fn();
  });

  it('should add correlation id to request', () => {
    correlationIdMiddleware(mockReq, mockRes, mockNext);
    expect(mockReq.correlationId).toBeDefined();
    expect(mockNext).toHaveBeenCalled();
  });

  it('should use existing correlation id from header', () => {
    mockReq.headers['x-correlation-id'] = 'existing-id';
    correlationIdMiddleware(mockReq, mockRes, mockNext);
    expect(mockReq.correlationId).toBe('existing-id');
  });
});
