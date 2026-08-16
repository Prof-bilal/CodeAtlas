import { describe, it, expect, vi, beforeEach } from 'vitest';
import { roleGuard, requireRole, requireSuperAdmin } from '../src/core/auth/guards/roleGuard.js';
import { permissionGuard, checkPermission } from '../src/core/auth/guards/permissionGuard.js';
import { Request, Response, NextFunction } from 'express';

describe('Role Guard', () => {
  const mockReq = (role?: string) => ({
    user: role ? { role } : undefined,
  } as Request);

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('roleGuard', () => {
    it('should allow access with correct role', () => {
      const guard = roleGuard('admin');
      const req = mockReq('admin');
      const res = mockRes();

      guard(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access with wrong role', () => {
      const guard = roleGuard('admin');
      const req = mockReq('user');
      const res = mockRes();

      guard(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Insufficient permissions' })
      );
    });

    it('should deny access when not authenticated', () => {
      const guard = roleGuard('admin');
      const req = mockReq();
      const res = mockRes();

      guard(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Authentication required' })
      );
    });
  });

  describe('requireRole', () => {
    it('should allow access with higher role', () => {
      const guard = requireRole('admin');
      const req = mockReq('superadmin');
      const res = mockRes();

      guard(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access with lower role', () => {
      const guard = requireRole('admin');
      const req = mockReq('user');
      const res = mockRes();

      guard(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireSuperAdmin', () => {
    it('should allow superadmin', () => {
      const req = mockReq('superadmin');
      const res = mockRes();

      requireSuperAdmin(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny non-superadmin', () => {
      const req = mockReq('admin');
      const res = mockRes();

      requireSuperAdmin(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});

describe('Permission Guard', () => {
  const mockReq = (role?: string) => ({
    user: role ? { role } : undefined,
  } as Request);

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('permissionGuard', () => {
    it('should allow access with correct permissions', () => {
      const guard = permissionGuard('tasks:read');
      const req = mockReq('user');
      const res = mockRes();

      guard(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access without permissions', () => {
      const guard = permissionGuard('admin:all');
      const req = mockReq('user');
      const res = mockRes();

      guard(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should allow superadmin all permissions', () => {
      const guard = permissionGuard('admin:all');
      const req = mockReq('superadmin');
      const res = mockRes();

      guard(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('checkPermission', () => {
    it('should check user permissions', () => {
      expect(checkPermission('tasks:read', 'user')).toBe(true);
      expect(checkPermission('admin:all', 'user')).toBe(false);
      expect(checkPermission('admin:all', 'superadmin')).toBe(true);
    });
  });
});
