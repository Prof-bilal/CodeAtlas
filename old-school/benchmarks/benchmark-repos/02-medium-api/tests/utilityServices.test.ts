import { describe, it, expect } from 'vitest';
import { healthChecker } from '../src/utils/health.js';
import { metricsCollector } from '../src/utils/metrics.js';
import { configManager } from '../src/utils/config.js';
import { eventBus } from '../src/events/eventBus.js';

describe('Utility Services', () => {
  describe('HealthChecker', () => {
    it('should run health checks', async () => {
      const result = await healthChecker.run();
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.uptime).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should register and run custom check', async () => {
      healthChecker.register('test-check', async () => ({
        name: 'test-check',
        status: 'healthy',
        timestamp: new Date(),
      }));

      const result = await healthChecker.run();
      expect(result.checks.some(c => c.name === 'test-check')).toBe(true);
    });
  });

  describe('MetricsCollector', () => {
    it('should record metrics', () => {
      metricsCollector.recordRequest();
      metricsCollector.recordRequest();
      metricsCollector.recordError();
      metricsCollector.recordResponseTime(100);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.requests).toBeGreaterThanOrEqual(2);
      expect(metrics.errors).toBeGreaterThanOrEqual(1);
    });

    it('should track connections', () => {
      metricsCollector.incrementConnections();
      metricsCollector.incrementConnections();
      metricsCollector.decrementConnections();

      const metrics = metricsCollector.getMetrics();
      expect(metrics.activeConnections).toBeGreaterThanOrEqual(1);
    });

    it('should calculate metrics', () => {
      const metrics = metricsCollector.getMetrics();
      expect(metrics.uptime).toBeDefined();
      expect(metrics.averageResponseTime).toBeDefined();
      expect(metrics.errorRate).toBeDefined();
      expect(metrics.requestsPerSecond).toBeDefined();
    });

    it('should reset metrics', () => {
      metricsCollector.reset();
      const metrics = metricsCollector.getMetrics();
      expect(metrics.requests).toBe(0);
    });
  });

  describe('ConfigManager', () => {
    it('should set and get values', () => {
      const manager = new (configManager.constructor as any)();
      manager.set('key', 'value');
      expect(manager.get('key')).toBe('value');
    });

    it('should use defaults', () => {
      const manager = new (configManager.constructor as any)({ defaultKey: 'defaultValue' });
      expect(manager.get('defaultKey')).toBe('defaultValue');
    });

    it('should check if key exists', () => {
      const manager = new (configManager.constructor as any)();
      manager.set('exists', true);
      expect(manager.has('exists')).toBe(true);
      expect(manager.has('notExists')).toBe(false);
    });

    it('should get all values', () => {
      const manager = new (configManager.constructor as any)();
      manager.set('key1', 'value1');
      manager.set('key2', 'value2');
      const all = manager.getAll();
      expect(all.key1).toBe('value1');
      expect(all.key2).toBe('value2');
    });

    it('should get keys', () => {
      const manager = new (configManager.constructor as any)();
      manager.set('key1', 'value1');
      manager.set('key2', 'value2');
      const keys = manager.getKeys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });

    it('should reset config', () => {
      const manager = new (configManager.constructor as any)({ defaultKey: 'defaultValue' });
      manager.set('customKey', 'customValue');
      manager.reset();
      expect(manager.get('defaultKey')).toBe('defaultValue');
      expect(manager.get('customKey')).toBeUndefined();
    });
  });

  describe('EventBus', () => {
    it('should publish and subscribe', async () => {
      const testBus = new (eventBus.constructor as any)();
      const handler = { handle: vi.fn() };
      
      testBus.subscribe('test.event', handler);
      await testBus.publish('test.event', { data: 'test' }, 'test');
      
      expect(handler.handle).toHaveBeenCalled();
    });

    it('should emit events', async () => {
      const testBus = new (eventBus.constructor as any)();
      const emittedEvents: any[] = [];
      
      testBus.on('eventPublished', (event: any) => {
        emittedEvents.push(event);
      });

      await testBus.publish('test.event', { data: 'test' }, 'test');
      expect(emittedEvents).toHaveLength(1);
    });

    it('should get stats', async () => {
      const testBus = new (eventBus.constructor as any)();
      await testBus.publish('test.event', { data: 'test' }, 'test');
      
      const stats = testBus.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.eventsByType['test.event']).toBe(1);
    });

    it('should clear events', async () => {
      const testBus = new (eventBus.constructor as any)();
      await testBus.publish('test.event', { data: 'test' }, 'test');
      testBus.clear();
      
      const events = testBus.getEvents();
      expect(events).toHaveLength(0);
    });
  });
});
