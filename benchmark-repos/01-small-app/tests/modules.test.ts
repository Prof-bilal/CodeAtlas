import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../src/utils/events.js';
import { ConfigManager } from '../src/utils/config.js';
import { MetricsCollector } from '../src/utils/metrics.js';
import { HealthChecker } from '../src/utils/health.js';
import { createTimer, measureTime, sleep, debounce, throttle } from '../src/utils/timer.js';
import { Serializer } from '../src/utils/serializer.js';

interface TestEvents {
  data: { value: number };
  error: Error;
}

describe('EventEmitter', () => {
  it('should emit and listen to events', () => {
    const emitter = new EventEmitter<TestEvents>();
    const handler = vi.fn();
    
    emitter.on('data', handler);
    emitter.emit('data', { value: 42 });
    
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('should remove listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const handler = vi.fn();
    
    emitter.on('data', handler);
    emitter.off('data', handler);
    emitter.emit('data', { value: 42 });
    
    expect(handler).not.toHaveBeenCalled();
  });

  it('should support once listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const handler = vi.fn();
    
    emitter.once('data', handler);
    emitter.emit('data', { value: 42 });
    emitter.emit('data', { value: 43 });
    
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('ConfigManager', () => {
  it('should get and set values', () => {
    const config = new ConfigManager({ default: 'value' });
    
    expect(config.get('default')).toBe('value');
    
    config.set('custom', 'customValue');
    expect(config.get('custom')).toBe('customValue');
  });

  it('should support overrides', () => {
    const config = new ConfigManager({ key: 'original' });
    
    config.setOverride('key', 'override');
    expect(config.get('key')).toBe('override');
  });

  it('should reset to defaults', () => {
    const config = new ConfigManager({ key: 'default' });
    
    config.set('key', 'modified');
    config.reset();
    
    expect(config.get('key')).toBe('default');
  });
});

describe('MetricsCollector', () => {
  it('should record metrics', () => {
    const metrics = new MetricsCollector();
    
    metrics.recordRequest();
    metrics.recordRequest();
    metrics.recordError();
    metrics.recordResponseTime(100);
    metrics.recordResponseTime(200);
    
    const result = metrics.getMetrics();
    
    expect(result.requests).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.averageResponseTime).toBe(150);
    expect(result.errorRate).toBe(50);
  });

  it('should reset metrics', () => {
    const metrics = new MetricsCollector();
    
    metrics.recordRequest();
    metrics.reset();
    
    const result = metrics.getMetrics();
    expect(result.requests).toBe(0);
  });
});

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

  it('should handle unhealthy checks', async () => {
    const checker = new HealthChecker();
    
    checker.register('test', async () => {
      throw new Error('Check failed');
    });
    
    const result = await checker.run();
    
    expect(result.status).toBe('unhealthy');
  });
});

describe('Timer', () => {
  it('should measure time', async () => {
    const timer = createTimer();
    
    timer.start();
    await sleep(100);
    const elapsed = timer.stop();
    
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it('should measure async function time', async () => {
    const { result, duration } = await measureTime(async () => {
      await sleep(50);
      return 'done';
    });
    
    expect(result).toBe('done');
    expect(duration).toBeGreaterThanOrEqual(40);
  });
});

describe('Serializer', () => {
  it('should serialize and deserialize', () => {
    const data = { name: 'test', value: 42 };
    const serialized = Serializer.serialize(data);
    const deserialized = Serializer.deserialize(serialized);
    
    expect(deserialized).toEqual(data);
  });

  it('should handle dates', () => {
    const data = { date: new Date('2024-01-15') };
    const serialized = Serializer.serializeWithDates(data);
    const deserialized = Serializer.deserializeWithDates(serialized);
    
    expect(deserialized.date).toBeInstanceOf(Date);
  });
});
