import { describe, it, expect } from 'vitest';
import { migrationRunner } from '../src/database/migrations.js';

describe('MigrationRunner', () => {
  it('should be defined', () => {
    expect(migrationRunner).toBeDefined();
  });

  it('should have pending migrations', () => {
    const pending = migrationRunner.getPendingMigrations();
    expect(pending.length).toBeGreaterThan(0);
  });

  it('should have migration ids', () => {
    const pending = migrationRunner.getPendingMigrations();
    pending.forEach(migration => {
      expect(migration.id).toBeDefined();
      expect(migration.name).toBeDefined();
      expect(migration.up).toBeDefined();
      expect(migration.down).toBeDefined();
    });
  });
});
