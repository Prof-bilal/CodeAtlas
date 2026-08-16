import { describe, it, expect } from 'vitest';
import { HealthChecker } from '../src/utils/health.js';

describe('HealthChecker', () => {
  it('should run health checks', async () => {
    const checker = new HealthChecker();
    
    checker.register('test', async () => ({
      name: 'test',
      status: 'healthy',
      timestamp: new Date(),
    }));
    
    const result = await checker.run();
    expect(result.status).toBe('healthy');
    expect(result.checks).toHaveLength(1);
  });

  it('should handle failing checks', async () => {
    const checker = new HealthChecker();
    
    checker.register('failing', async () => {
      throw new Error('Check failed');
    });
    
    const result = await checker.run();
    expect(result.status).toBe('unhealthy');
  });
});
