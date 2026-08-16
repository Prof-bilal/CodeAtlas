export interface AuditAction {
  CREATE: 'create';
  READ: 'read';
  UPDATE: 'update';
  DELETE: 'delete';
  LOGIN: 'login';
  LOGOUT: 'logout';
  EXPORT: 'export';
  IMPORT: 'import';
}

export interface AuditResource {
  USER: 'user';
  TASK: 'task';
  PAYMENT: 'payment';
  SUBSCRIPTION: 'subscription';
  NOTIFICATION: 'notification';
  FILE: 'file';
  WEBHOOK: 'webhook';
  API_KEY: 'api_key';
  SETTINGS: 'settings';
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditFilter {
  userId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface AuditStats {
  totalLogs: number;
  logsByAction: Record<string, number>;
  logsByResource: Record<string, number>;
  logsByUser: Record<string, number>;
}

export const AuditActions: AuditAction = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  LOGIN: 'login',
  LOGOUT: 'logout',
  EXPORT: 'export',
  IMPORT: 'import',
};

export const AuditResources: AuditResource = {
  USER: 'user',
  TASK: 'task',
  PAYMENT: 'payment',
  SUBSCRIPTION: 'subscription',
  NOTIFICATION: 'notification',
  FILE: 'file',
  WEBHOOK: 'webhook',
  API_KEY: 'api_key',
  SETTINGS: 'settings',
};
