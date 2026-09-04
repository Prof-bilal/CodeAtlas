import { describe, it, expect } from 'vitest';
import { DatabaseService } from '../../src/database/databaseService.js';

describe('DatabaseService', () => {
  let db: DatabaseService;

  beforeEach(() => {
    db = new DatabaseService();
  });

  it('should initialize database', () => {
    expect(db).toBeDefined();
  });

  it('should run migrations', async () => {
    await expect(db.runMigrations()).resolves.toBeUndefined();
  });

  it('should close connection', async () => {
    await expect(db.close()).resolves.toBeUndefined();
  });
});
