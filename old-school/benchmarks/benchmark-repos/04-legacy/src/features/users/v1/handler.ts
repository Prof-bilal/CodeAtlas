// Feature handlers v1 - users
// DEPRECATED

import { Request, Response } from 'express';
import { findUserByEmail, findUserByUsername, createUser } from '../../../users';
import { Database } from '../../../database/connection';

let db: Database;

export function init(dbConn: Database) {
  db = dbConn;
}

export async function handleGetUser(req: Request, res: Response) {
  const { id } = req.params;
  // V1 only had email lookup
  const user = await findUserByEmail(db, id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // V1 returned password hash (bad!)
  res.json({ user });
}

export async function handleCreateUser(req: Request, res: Response) {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const user = await createUser(db, username, email, password);
    res.status(201).json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
}

// V1 had no validation at all
export async function handleUpdateUser(req: Request, res: Response) {
  const { id } = req.params;
  const updates = req.body;

  // Directly update without validation
  await db.query(
    'UPDATE users SET ? WHERE id = ?',
    [updates, id]
  );

  res.json({ success: true });
}
