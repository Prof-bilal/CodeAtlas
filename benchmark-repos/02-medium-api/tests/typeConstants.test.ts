import { describe, it, expect } from 'vitest';
import { AuditActions, AuditResources } from '../src/types/audit.js';
import { WEBHOOK_EVENTS } from '../src/types/webhooks.js';
import { WIDGET_TYPES, CHART_TYPES } from '../src/types/dashboards.js';
import { INTEGRATION_TYPES, INTEGRATION_ACTIONS } from '../src/types/integrations.js';
import { WORKFLOW_STEP_TYPES, WORKFLOW_TRIGGERS } from '../src/types/workflows.js';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../src/types/files.js';
import { SEARCH_FIELDS, SEARCH_BOOST } from '../src/types/search.js';

describe('Type Constants', () => {
  describe('AuditActions', () => {
    it('should have all audit actions', () => {
      expect(AuditActions.CREATE).toBe('create');
      expect(AuditActions.READ).toBe('read');
      expect(AuditActions.UPDATE).toBe('update');
      expect(AuditActions.DELETE).toBe('delete');
      expect(AuditActions.LOGIN).toBe('login');
      expect(AuditActions.LOGOUT).toBe('logout');
      expect(AuditActions.EXPORT).toBe('export');
      expect(AuditActions.IMPORT).toBe('import');
    });
  });

  describe('AuditResources', () => {
    it('should have all audit resources', () => {
      expect(AuditResources.USER).toBe('user');
      expect(AuditResources.TASK).toBe('task');
      expect(AuditResources.PAYMENT).toBe('payment');
      expect(AuditResources.SUBSCRIPTION).toBe('subscription');
      expect(AuditResources.NOTIFICATION).toBe('notification');
      expect(AuditResources.FILE).toBe('file');
      expect(AuditResources.WEBHOOK).toBe('webhook');
      expect(AuditResources.API_KEY).toBe('api_key');
      expect(AuditResources.SETTINGS).toBe('settings');
    });
  });

  describe('WEBHOOK_EVENTS', () => {
    it('should have webhook events', () => {
      expect(WEBHOOK_EVENTS).toContain('user.registered');
      expect(WEBHOOK_EVENTS).toContain('task.created');
      expect(WEBHOOK_EVENTS).toContain('payment.success');
    });
  });

  describe('WIDGET_TYPES', () => {
    it('should have widget types', () => {
      expect(WIDGET_TYPES).toContain('metric');
      expect(WIDGET_TYPES).toContain('chart');
      expect(WIDGET_TYPES).toContain('table');
    });
  });

  describe('CHART_TYPES', () => {
    it('should have chart types', () => {
      expect(CHART_TYPES).toContain('line');
      expect(CHART_TYPES).toContain('bar');
      expect(CHART_TYPES).toContain('pie');
    });
  });

  describe('INTEGRATION_TYPES', () => {
    it('should have integration types', () => {
      expect(INTEGRATION_TYPES.length).toBeGreaterThan(0);
      expect(INTEGRATION_TYPES.find(i => i.id === 'github')).toBeDefined();
    });
  });

  describe('INTEGRATION_ACTIONS', () => {
    it('should have integration actions', () => {
      expect(INTEGRATION_ACTIONS).toContain('sync');
      expect(INTEGRATION_ACTIONS).toContain('import');
      expect(INTEGRATION_ACTIONS).toContain('export');
    });
  });

  describe('WORKFLOW_STEP_TYPES', () => {
    it('should have workflow step types', () => {
      expect(WORKFLOW_STEP_TYPES).toContain('http');
      expect(WORKFLOW_STEP_TYPES).toContain('transform');
      expect(WORKFLOW_STEP_TYPES).toContain('filter');
    });
  });

  describe('WORKFLOW_TRIGGERS', () => {
    it('should have workflow triggers', () => {
      expect(WORKFLOW_TRIGGERS).toContain('manual');
      expect(WORKFLOW_TRIGGERS).toContain('schedule');
      expect(WORKFLOW_TRIGGERS).toContain('event');
    });
  });

  describe('ALLOWED_MIME_TYPES', () => {
    it('should have allowed mime types', () => {
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
    });
  });

  describe('MAX_FILE_SIZE', () => {
    it('should have max file size', () => {
      expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
    });
  });

  describe('SEARCH_FIELDS', () => {
    it('should have search fields', () => {
      expect(SEARCH_FIELDS.task).toContain('title');
      expect(SEARCH_FIELDS.user).toContain('name');
    });
  });

  describe('SEARCH_BOOST', () => {
    it('should have search boost values', () => {
      expect(SEARCH_BOOST.title).toBe(2.0);
      expect(SEARCH_BOOST.name).toBe(1.5);
    });
  });
});
