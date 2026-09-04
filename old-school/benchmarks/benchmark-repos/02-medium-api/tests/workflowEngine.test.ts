import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from '../src/core/workflows/workflowEngine.js';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  it('should create workflow', () => {
    const workflow = engine.createWorkflow({
      name: 'Test Workflow',
      steps: [],
      active: true,
    });

    expect(workflow).toBeDefined();
    expect(workflow.id).toBeDefined();
    expect(workflow.name).toBe('Test Workflow');
  });

  it('should get workflow', () => {
    const workflow = engine.createWorkflow({
      name: 'Test Workflow',
      steps: [],
      active: true,
    });

    const retrieved = engine.getWorkflow(workflow.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Test Workflow');
  });

  it('should list workflows', () => {
    engine.createWorkflow({ name: 'Workflow 1', steps: [], active: true });
    engine.createWorkflow({ name: 'Workflow 2', steps: [], active: true });

    const workflows = engine.listWorkflows();
    expect(workflows.length).toBe(2);
  });

  it('should execute workflow', async () => {
    const workflow = engine.createWorkflow({
      name: 'Test Workflow',
      steps: [
        {
          id: 'step-1',
          type: 'transform',
          name: 'Transform',
          config: {},
          execute: async (input) => ({ ...input, processed: true }),
        },
      ],
      active: true,
    });

    const run = await engine.executeWorkflow(workflow.id, { data: 'test' });
    expect(run.status).toBe('completed');
    expect(run.output).toEqual({ data: 'test', processed: true });
  });

  it('should fail on inactive workflow', async () => {
    const workflow = engine.createWorkflow({
      name: 'Inactive Workflow',
      steps: [],
      active: false,
    });

    await expect(engine.executeWorkflow(workflow.id)).rejects.toThrow('not active');
  });

  it('should update workflow', () => {
    const workflow = engine.createWorkflow({
      name: 'Original Name',
      steps: [],
      active: true,
    });

    const updated = engine.updateWorkflow(workflow.id, { name: 'Updated Name' });
    expect(updated?.name).toBe('Updated Name');
  });

  it('should delete workflow', () => {
    const workflow = engine.createWorkflow({
      name: 'To Delete',
      steps: [],
      active: true,
    });

    const deleted = engine.deleteWorkflow(workflow.id);
    expect(deleted).toBe(true);
    expect(engine.getWorkflow(workflow.id)).toBeUndefined();
  });
});
