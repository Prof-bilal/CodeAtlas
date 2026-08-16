import { describe, it, expect } from 'vitest';
import { MetricsCollector, metricCounter, metricHistogram, metricGauge } from '../../src/utils/metrics.js';

describe('Metrics', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  it('should record counter', () => {
    collector.increment('requests', 1);
    collector.increment('requests', 5);
    expect(collector.getCounter('requests')).toBe(6);
  });

  it('should record histogram', () => {
    collector.observe('response_time', 100);
    collector.observe('response_time', 200);
    collector.observe('response_time', 150);
    const stats = collector.getHistogram('response_time');
    expect(stats.count).toBe(3);
    expect(stats.avg).toBeGreaterThan(0);
  });

  it('should record gauge', () => {
    collector.setGauge('connections', 42);
    expect(collector.getGauge('connections')).toBe(42);
  });

  it('should export metrics', () => {
    collector.increment('test_counter', 1);
    const metrics = collector.export();
    expect(metrics).toBeDefined();
  });
});
