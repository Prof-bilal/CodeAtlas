// Analytics service - CURRENT

import { Database } from '../database/connection';
import { Redis } from '../integrations/redis';
import { Logger } from '../utils';

export interface AnalyticsEvent {
  id: string;
  userId: string;
  event: string;
  properties: Record<string, any>;
  timestamp: Date;
  sessionId: string;
  userAgent: string;
  ipAddress: string;
}

export interface AnalyticsMetric {
  name: string;
  value: number;
  timestamp: Date;
  dimensions?: Record<string, string>;
}

export interface AnalyticsReport {
  id: string;
  type: string;
  period: { start: Date; end: Date };
  metrics: AnalyticsMetric[];
  generatedAt: Date;
}

export class AnalyticsService {
  private db: Database;
  private redis: Redis;

  constructor(db: Database, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  async trackEvent(event: Omit<AnalyticsEvent, 'id' | 'timestamp'>): Promise<AnalyticsEvent> {
    const id = evt__;

    const fullEvent: AnalyticsEvent = {
      ...event,
      id,
      timestamp: new Date(),
    };

    await this.db.query(
      INSERT INTO analytics_events (id, user_id, event, properties, timestamp, session_id, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?),
      [id, event.userId, event.event, JSON.stringify(event.properties),
       fullEvent.timestamp.toISOString(), event.sessionId, event.userAgent, event.ipAddress]
    );

    // Cache recent events
    await this.redis.lpush(events:, JSON.stringify(fullEvent));
    await this.redis.ltrim(events:, 0, 99);

    return fullEvent;
  }

  async getEvents(userId: string, options: {
    event?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): Promise<AnalyticsEvent[]> {
    let query = 'SELECT * FROM analytics_events WHERE user_id = ?';
    const params: any[] = [userId];

    if (options.event) {
      query += ' AND event = ?';
      params.push(options.event);
    }

    if (options.startDate) {
      query += ' AND timestamp >= ?';
      params.push(options.startDate.toISOString());
    }

    if (options.endDate) {
      query += ' AND timestamp <= ?';
      params.push(options.endDate.toISOString());
    }

    query += ' ORDER BY timestamp DESC';
    query +=  LIMIT ;

    const results = await this.db.query(query, params) as any[];
    return results.map(this.mapEventRow);
  }

  async getMetrics(metricName: string, options: {
    startDate: Date;
    endDate: Date;
    granularity?: 'hour' | 'day' | 'week' | 'month';
    dimensions?: Record<string, string>;
  }): Promise<AnalyticsMetric[]> {
    const results = await this.db.query(
      SELECT * FROM analytics_metrics
       WHERE name = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp,
      [metricName, options.startDate.toISOString(), options.endDate.toISOString()]
    ) as any[];

    return results.map(this.mapMetricRow);
  }

  async aggregateEvents(event: string, options: {
    startDate: Date;
    endDate: Date;
    groupBy?: string;
  }): Promise<{ count: number; uniqueUsers: number; avgPerUser: number }> {
    const results = await this.db.query(
      SELECT
         COUNT(*) as count,
         COUNT(DISTINCT user_id) as unique_users
       FROM analytics_events
       WHERE event = ? AND timestamp >= ? AND timestamp <= ?,
      [event, options.startDate.toISOString(), options.endDate.toISOString()]
    ) as any[];

    const count = results[0].count;
    const uniqueUsers = results[0].unique_users;

    return {
      count,
      uniqueUsers,
      avgPerUser: uniqueUsers > 0 ? count / uniqueUsers : 0,
    };
  }

  async generateReport(type: string, period: { start: Date; end: Date }): Promise<AnalyticsReport> {
    const metrics: AnalyticsMetric[] = [];

    // Generate common metrics
    const events = await this.aggregateEvents('page_view', { startDate: period.start, endDate: period.end });
    metrics.push({ name: 'page_views', value: events.count, timestamp: new Date() });
    metrics.push({ name: 'unique_visitors', value: events.uniqueUsers, timestamp: new Date() });

    const signups = await this.aggregateEvents('signup', { startDate: period.start, endDate: period.end });
    metrics.push({ name: 'signups', value: signups.count, timestamp: new Date() });

    const purchases = await this.aggregateEvents('purchase', { startDate: period.start, endDate: period.end });
    metrics.push({ name: 'purchases', value: purchases.count, timestamp: new Date() });

    return {
      id: pt_,
      type,
      period,
      metrics,
      generatedAt: new Date(),
    };
  }

  async getRealtimeStats(userId: string): Promise<{
    activeUsers: number;
    eventsLastHour: number;
    topEvents: Array<{ event: string; count: number }>;
  }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const results = await this.db.query(
      SELECT event, COUNT(*) as count
       FROM analytics_events
       WHERE user_id = ? AND timestamp >= ?
       GROUP BY event
       ORDER BY count DESC
       LIMIT 10,
      [userId, oneHourAgo.toISOString()]
    ) as any[];

    const totalResults = await this.db.query(
      SELECT COUNT(DISTINCT session_id) as active_users, COUNT(*) as total_events
       FROM analytics_events
       WHERE user_id = ? AND timestamp >= ?,
      [userId, oneHourAgo.toISOString()]
    ) as any[];

    return {
      activeUsers: totalResults[0].active_users,
      eventsLastHour: totalResults[0].total_events,
      topEvents: results.map((r: any) => ({ event: r.event, count: r.count })),
    };
  }

  private mapEventRow(row: any): AnalyticsEvent {
    return {
      id: row.id,
      userId: row.user_id,
      event: row.event,
      properties: typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties,
      timestamp: new Date(row.timestamp),
      sessionId: row.session_id,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
    };
  }

  private mapMetricRow(row: any): AnalyticsMetric {
    return {
      name: row.name,
      value: row.value,
      timestamp: new Date(row.timestamp),
      dimensions: row.dimensions ? (typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : row.dimensions) : undefined,
    };
  }
}
