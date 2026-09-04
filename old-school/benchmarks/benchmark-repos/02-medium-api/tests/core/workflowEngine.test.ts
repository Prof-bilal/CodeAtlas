import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from '../../src/core/workflows/workflowEngine.js';
import { EventBus } from '../../src/events/eventBus.js';

vi.mock('../../src/events/eventBus.js');

describe('WorkflowEngine', () => {
  let workflowEngine: WorkflowEngine;
  let mockEventBus: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventBus = { emit: vi.fn() };
    workflowEngine = new WorkflowEngine(mockEventBus);
  });

  describe('createWorkflow', () => {
    it('should create a workflow', async () => {
      const workflow = await workflowEngine.createWorkflow({
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: [
          { id: 'step-1', name: 'Step 1', type: 'http', config: { url: 'https://example.com' } },
        ],
        active: true,
      });

      expect(workflow.id).toBeDefined();
      expect(workflow.name).toBe('Test Workflow');
      expect(workflow.steps).toHaveLength(1);
    });
  });

  describe('executeWorkflow', () => {
    it('should execute workflow steps', async () => {
      const workflow = await workflowEngine.createWorkflow({
        name: 'Test',
        description: '',
        steps: [
          { id: 'step-1', name: 'Step 1', type: 'http', config: { url: 'https://example.com' } },
        ],
        active: true,
      });

      const execution = await workflowEngine.executeWorkflow(workflow.id);
      expect(execution.status).toBe('completed');
      expect(execution.results['step-1']).toBeDefined();
    });

    it('should fail on non-existent workflow', async () => {
      await expect(workflowEngine.executeWorkflow('nonexistent')).rejects.toThrow('Workflow not found');
    });
  });

  describe('getStats', () => {
    it('should return stats', async () => {
      await workflowEngine.createWorkflow({ name: 'W1', description: '', steps: [], active: true });
      const stats = await workflowEngine.getStats();
      expect(stats.totalWorkflows).toBe(1);
    });
  });
});
