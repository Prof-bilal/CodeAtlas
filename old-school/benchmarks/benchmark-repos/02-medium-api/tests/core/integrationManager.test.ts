import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationManager } from '../../src/core/integrations/integrationManager.js';

describe('IntegrationManager', () => {
  let integrationManager: IntegrationManager;

  beforeEach(() => {
    integrationManager = new IntegrationManager();
  });

  describe('registerIntegration', () => {
    it('should register an integration', async () => {
      await integrationManager.registerIntegration({
        name: 'slack',
        type: 'slack',
        credentials: { token: 'xoxb-test' },
        enabled: true,
      });

      const integrations = await integrationManager.listIntegrations();
      expect(integrations).toHaveLength(1);
      expect(integrations[0].type).toBe('slack');
    });
  });

  describe('sendEvent', () => {
    it('should send event to integration', async () => {
      await integrationManager.registerIntegration({
        name: 'slack',
        type: 'slack',
        credentials: { token: 'xoxb-test' },
        enabled: true,
      });

      const result = await integrationManager.sendEvent('slack', {
        type: 'task:created',
        payload: { taskId: '123' },
        timestamp: new Date(),
      });

      expect(result).toBe(true);
    });

    it('should fail for disabled integration', async () => {
      await integrationManager.registerIntegration({
        name: 'slack',
        type: 'slack',
        credentials: {},
        enabled: false,
      });

      const result = await integrationManager.sendEvent('slack', {
        type: 'test',
        payload: {},
        timestamp: new Date(),
      });

      expect(result).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('should test integration connection', async () => {
      await integrationManager.registerIntegration({
        name: 'slack',
        type: 'slack',
        credentials: {},
        enabled: true,
      });

      const result = await integrationManager.testConnection('slack');
      expect(result.success).toBe(true);
    });

    it('should fail for non-existent integration', async () => {
      const result = await integrationManager.testConnection('nonexistent');
      expect(result.success).toBe(false);
    });
  });
});
