import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/types/config.js';
import { createSuccessResponse, createErrorResponse, createPaginatedResponse } from '../src/types/responses.js';
import { AuditActions, AuditResources } from '../src/types/audit.js';
import { WEBHOOK_EVENTS } from '../src/types/webhooks.js';
import { WIDGET_TYPES, CHART_TYPES } from '../src/types/dashboards.js';
import { INTEGRATION_TYPES, INTEGRATION_ACTIONS } from '../src/types/integrations.js';
import { WORKFLOW_STEP_TYPES, WORKFLOW_TRIGGERS } from '../src/types/workflows.js';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../src/types/files.js';
import { SEARCH_FIELDS, SEARCH_BOOST } from '../src/types/search.js';

describe('Type System', () => {
  describe('Config', () => {
    it('should have valid config structure', () => {
      expect(defaultConfig.port).toBeGreaterThan(0);
      expect(defaultConfig.host).toBeDefined();
      expect(defaultConfig.env).toBeDefined();
    });
  });

  describe('Responses', () => {
    it('should create valid success response', () => {
      const response = createSuccessResponse({ id: 1 });
      expect(response.success).toBe(true);
      expect(response.data).toEqual({ id: 1 });
    });

    it('should create valid error response', () => {
      const response = createErrorResponse('Error');
      expect(response.success).toBe(false);
      expect(response.error).toBe('Error');
    });

    it('should create valid paginated response', () => {
      const response = createPaginatedResponse([1, 2], 1, 10, 100);
      expect(response.success).toBe(true);
      expect(response.pagination.total).toBe(100);
    });
  });

  describe('Audit', () => {
    it('should have valid audit actions', () => {
      expect(AuditActions.CREATE).toBe('create');
      expect(AuditActions.READ).toBe('read');
      expect(AuditActions.UPDATE).toBe('update');
      expect(AuditActions.DELETE).toBe('delete');
    });

    it('should have valid audit resources', () => {
      expect(AuditResources.USER).toBe('user');
      expect(AuditResources.TASK).toBe('task');
      expect(AuditResources.PAYMENT).toBe('payment');
    });
  });

  describe('Webhooks', () => {
    it('should have valid webhook events', () => {
      expect(WEBHOOK_EVENTS).toContain('user.registered');
      expect(WEBHOOK_EVENTS).toContain('task.created');
      expect(WEBHOOK_EVENTS).toContain('payment.success');
    });
  });

  describe('Dashboards', () => {
    it('should have valid widget types', () => {
      expect(WIDGET_TYPES).toContain('metric');
      expect(WIDGET_TYPES).toContain('chart');
    });

    it('should have valid chart types', () => {
      expect(CHART_TYPES).toContain('line');
      expect(CHART_TYPES).toContain('bar');
    });
  });

  describe('Integrations', () => {
    it('should have valid integration types', () => {
      expect(INTEGRATION_TYPES.length).toBeGreaterThan(0);
    });

    it('should have valid integration actions', () => {
      expect(INTEGRATION_ACTIONS).toContain('sync');
      expect(INTEGRATION_ACTIONS).toContain('import');
    });
  });

  describe('Workflows', () => {
    it('should have valid step types', () => {
      expect(WORKFLOW_STEP_TYPES).toContain('http');
      expect(WORKFLOW_STEP_TYPES).toContain('transform');
    });

    it('should have valid triggers', () => {
      expect(WORKFLOW_TRIGGERS).toContain('manual');
      expect(WORKFLOW_TRIGGERS).toContain('schedule');
    });
  });

  describe('Files', () => {
    it('should have valid mime types', () => {
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
    });

    it('should have valid max file size', () => {
      expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
    });
  });

  describe('Search', () => {
    it('should have valid search fields', () => {
      expect(SEARCH_FIELDS.task).toContain('title');
      expect(SEARCH_FIELDS.user).toContain('name');
    });

    it('should have valid search boost', () => {
      expect(SEARCH_BOOST.title).toBe(2.0);
      expect(SEARCH_BOOST.name).toBe(1.5);
    });
  });
});
