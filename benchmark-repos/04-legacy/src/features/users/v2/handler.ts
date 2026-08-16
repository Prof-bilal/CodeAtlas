// Feature handlers v2 - users
// CURRENT for most API clients

import { Request, Response } from 'express';
import { UserService } from '../../../userService';
import { Database } from '../../../database/connection';
import { Redis } from '../../../integrations/redis';
import { Logger } from '../../../utils';

let userService: UserService;

export function initUserV2(db: Database, redis: Redis) {
  userService = new UserService(db, redis);
}

export async function handleGetProfile(req: Request, res: Response) {
  const userId = req.params.id || (req as any).user?.id;

  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  const profile = await userService.getProfile(userId);

  if (!profile) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ success: true, data: profile });
}

export async function handleUpdateProfile(req: Request, res: Response) {
  const userId = (req as any).user?.id;
  const { displayName, avatarUrl, bio } = req.body;

  try {
    const profile = await userService.updateProfile(userId, {
      displayName,
      avatarUrl,
      bio,
    });

    res.json({ success: true, data: profile });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleSearchUsers(req: Request, res: Response) {
  const { q, limit } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Search query required' });
  }

  const users = await userService.searchUsers(q, parseInt(limit as string) || 20);

  res.json({
    success: true,
    data: users.map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
    })),
  });
}

export async function handleGetStats(req: Request, res: Response) {
  const stats = await userService.getStats();
  res.json({ success: true, data: stats });
}

// Admin endpoints
export async function handleDeactivateUser(req: Request, res: Response) {
  const { id } = req.params;
  const currentUser = (req as any).user;

  if (currentUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  await userService.deactivateUser(id);
  res.json({ success: true });
}

export async function handleReactivateUser(req: Request, res: Response) {
  const { id } = req.params;
  const currentUser = (req as any).user;

  if (currentUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  await userService.reactivateUser(id);
  res.json({ success: true });
}

export async function handleDeleteUser(req: Request, res: Response) {
  const { id } = req.params;
  const currentUser = (req as any).user;

  if (currentUser.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  await userService.deleteUser(id);
  res.json({ success: true });
}
