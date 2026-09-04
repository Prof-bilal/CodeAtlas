import { describe, it, expect } from 'vitest';
import { MetricsCollector } from '../src/utils/metrics.js';

describe('MetricsCollector', () => {
  it('should record metrics', () => {
    const collector = new MetricsCollector();
    
    collector.recordRequest();
    collector.recordRequest();
    collector.recordError();
    collector.recordResponseTime(100);
    
    const metrics = collector.getMetrics();
    expect(metrics.requests).toBe(2);
    expect(metrics.errors).toBe(1);
    expect(metrics.averageResponseTime).toBe(100);
  });

  it('should calculate error rate', () => {
    const collector = new MetricsCollector();
    
    for (let i = 0; i < 10; i++) {
      collector.recordRequest();
    }
    collector.recordError();
    
    const metrics = collector.getMetrics();
    expect(metrics.errorRate).toBe(10);
  });
});
