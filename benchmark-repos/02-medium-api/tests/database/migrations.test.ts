import { describe, it, expect } from 'vitest';
import { Migrations } from '../../src/database/migrations.js';

describe('Migrations', () => {
  it('should have migration definitions', () => {
    expect(Migrations).toBeDefined();
    expect(Array.isArray(Migrations)).toBe(true);
  });

  it('should have valid migration structure', () => {
    for (const migration of Migrations) {
      expect(migration.id).toBeDefined();
      expect(migration.name).toBeDefined();
      expect(typeof migration.up).toBe('function');
      expect(typeof migration.down).toBe('function');
    }
  });
});
