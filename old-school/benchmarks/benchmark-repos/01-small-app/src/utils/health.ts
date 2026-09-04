export interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  latency?: number;
  timestamp: Date;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: HealthCheck[];
  uptime: number;
  timestamp: Date;
}

export class HealthChecker {
  private checks: Map<string, () => Promise<HealthCheck>> = new Map();
  private startTime: number = Date.now();

  register(name: string, checkFn: () => Promise<HealthCheck>): void {
    this.checks.set(name, checkFn);
  }

  async run(): Promise<HealthCheckResult> {
    const checks: HealthCheck[] = [];

    for (const [name, checkFn] of this.checks) {
      try {
        const check = await checkFn();
        checks.push(check);
      } catch (error) {
        checks.push({
          name,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }

    const status = this.determineOverallStatus(checks);
    const uptime = (Date.now() - this.startTime) / 1000;

    return {
      status,
      checks,
      uptime,
      timestamp: new Date(),
    };
  }

  private determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'unhealthy' | 'degraded' {
    if (checks.some(check => check.status === 'unhealthy')) {
      return 'unhealthy';
    }

    if (checks.some(check => check.status === 'degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }
}

export const healthChecker = new HealthChecker();
