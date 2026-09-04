import { EventHandler, Event } from './eventBus.js';
import { logger } from '../utils/logger.js';

export class AuditLogCreatedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { auditLogId, userId, action, resource } = event.data;
    logger.info(`Audit log created: ${auditLogId} - ${userId} performed ${action} on ${resource}`);
  }
}

export class AuditReportGeneratedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { reportId, userId, dateRange, totalEvents } = event.data;
    logger.info(`Audit report generated: ${reportId} for user ${userId} with ${totalEvents} events`);
  }
}

export class AuditLogExportedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { exportId, userId, format, recordCount } = event.data;
    logger.info(`Audit logs exported: ${exportId} for user ${userId} in ${format} format`);
  }
}

export class AuditLogAnomalyDetectedHandler implements EventHandler {
  async handle(event: Event): Promise<void> {
    const { anomalyType, userId, details, severity } = event.data;
    logger.warn(`Audit anomaly detected: ${anomalyType} for user ${userId} (severity: ${severity})`);
  }
}
