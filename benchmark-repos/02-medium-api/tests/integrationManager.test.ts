import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationManager } from '../src/core/integrations/integrationManager.js';

describe('IntegrationManager', () => {
  let manager: IntegrationManager;

  beforeEach(() => {
    manager = new IntegrationManager();
  });

  it('should create integration', () => {
    const integration = manager.createIntegration({
      type: 'github',
      name: 'My GitHub',
      config: { token: 'test', repository: 'test/repo' },
      active: true,
      userId: 'user-1',
    });

    expect(integration).toBeDefined();
    expect(integration.id).toBeDefined();
    expect(integration.type).toBe('github');
  });

  it('should get integration', () => {
    const integration = manager.createIntegration({
      type: 'github',
      name: 'My GitHub',
      config: {},
      active: true,
      userId: 'user-1',
    });

    const retrieved = manager.getIntegration(integration.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('My GitHub');
  });

  it('should list integrations', () => {
    manager.createIntegration({ type: 'github', name: 'GitHub', config: {}, active: true, userId: 'user-1' });
    manager.createIntegration({ type: 'slack', name: 'Slack', config: {}, active: true, userId: 'user-1' });

    const integrations = manager.listIntegrations('user-1');
    expect(integrations.length).toBe(2);
  });

  it('should update integration', () => {
    const integration = manager.createIntegration({
      type: 'github',
      name: 'Original',
      config: {},
      active: true,
      userId: 'user-1',
    });

    const updated = manager.updateIntegration(integration.id, { name: 'Updated' });
    expect(updated?.name).toBe('Updated');
  });

  it('should delete integration', () => {
    const integration = manager.createIntegration({
      type: 'github',
      name: 'To Delete',
      config: {},
      active: true,
      userId: 'user-1',
    });

    const deleted = manager.deleteIntegration(integration.id);
    expect(deleted).toBe(true);
  });

  it('should get integration types', () => {
    const types = manager.getIntegrationTypes();
    expect(types.length).toBeGreaterThan(0);
    expect(types.some(t => t.id === 'github')).toBe(true);
  });

  it('should test integration', async () => {
    const integration = manager.createIntegration({
      type: 'github',
      name: 'Test',
      config: {},
      active: true,
      userId: 'user-1',
    });

    const result = await manager.testIntegration(integration.id);
    expect(result.success).toBe(true);
  });
});
