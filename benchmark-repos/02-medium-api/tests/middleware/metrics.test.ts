import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { metricsMiddleware } from '../../src/middleware/metrics.js';

describe('MetricsMiddleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = { method: 'GET', path: '/test' };
    mockRes = { statusCode: 200, on: vi.fn() };
    mockNext = vi.fn();
  });

  it('should call next', () => {
    metricsMiddleware(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
