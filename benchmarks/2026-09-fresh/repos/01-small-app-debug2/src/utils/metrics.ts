export interface Metrics {
  requests: number;
  errors: number;
  responseTimes: number[];
  activeConnections: number;
}

export class MetricsCollector {
  private metrics: Metrics = {
    requests: 0,
    errors: 0,
    responseTimes: [],
    activeConnections: 0,
  };

  private startTime: number = Date.now();

  recordRequest(): void {
    this.metrics.requests++;
  }

  recordError(): void {
    this.metrics.errors++;
  }

  recordResponseTime(time: number): void {
    this.metrics.responseTimes.push(time);
    
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }
  }

  incrementConnections(): void {
    this.metrics.activeConnections++;
  }

  decrementConnections(): void {
    this.metrics.activeConnections--;
  }

  getMetrics(): Metrics & {
    uptime: number;
    averageResponseTime: number;
    errorRate: number;
    requestsPerSecond: number;
  } {
    const uptime = (Date.now() - this.startTime) / 1000;
    const averageResponseTime = this.metrics.responseTimes.length > 0
      ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
      : 0;
    const errorRate = this.metrics.requests > 0
      ? (this.metrics.errors / this.metrics.requests) * 100
      : 0;
    const requestsPerSecond = uptime > 0
      ? this.metrics.requests / uptime
      : 0;

    return {
      ...this.metrics,
      uptime,
      averageResponseTime,
      errorRate,
      requestsPerSecond,
    };
  }

  reset(): void {
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTimes: [],
      activeConnections: 0,
    };
    this.startTime = Date.now();
  }
}

export const metricsCollector = new MetricsCollector();
