import { describe, it, expect } from 'vitest';
import { createSuccessResponse, createErrorResponse, createPaginatedResponse } from '../src/types/responses.js';

describe('Response Types', () => {
  describe('createSuccessResponse', () => {
    it('should create success response', () => {
      const response = createSuccessResponse({ id: 1 }, 'Success');
      expect(response.success).toBe(true);
      expect(response.data).toEqual({ id: 1 });
      expect(response.message).toBe('Success');
      expect(response.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response', () => {
      const response = createErrorResponse('Not Found', 'Resource not found');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Not Found');
      expect(response.message).toBe('Resource not found');
      expect(response.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('createPaginatedResponse', () => {
    it('should create paginated response', () => {
      const response = createPaginatedResponse([1, 2, 3], 1, 10, 100);
      expect(response.success).toBe(true);
      expect(response.data).toEqual([1, 2, 3]);
      expect(response.pagination.page).toBe(1);
      expect(response.pagination.limit).toBe(10);
      expect(response.pagination.total).toBe(100);
      expect(response.pagination.totalPages).toBe(10);
    });
  });
});
