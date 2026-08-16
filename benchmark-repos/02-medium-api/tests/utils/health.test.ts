import { describe, it, expect } from 'vitest';
import { HealthChecker } from '../../src/utils/health.js';

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker();
  });

  it('should register health checks', () => {
    checker.register('database', async () => true);
    expect(checker.hasCheck('database')).toBe(true);
  });

  it('should run health checks', async () => {
    checker.register('database', async () => true);
    checker.register('redis', async () => true);
    const results = await checker.runAll();
    expect(results.database).toBe(true);
    expect(results.redis).toBe(true);
  });

  it('should handle failed checks', async () => {
    checker.register('failing', async () => false);
    const results = await checker.runAll();
    expect(results.failing).toBe(false);
  });

  it('should get overall status', async () => {
    checker.register('ok', async () => true);
    const status = await checker.getStatus();
    expect(status).toBe('healthy');
  });
});
