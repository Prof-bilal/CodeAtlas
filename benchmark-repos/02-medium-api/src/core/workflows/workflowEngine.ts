import { logger } from '../utils/logger.js';
import { EventBus } from '../events/eventBus.js';

export interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  next?: string;
  error?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  currentStep?: string;
  results: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private executions: WorkflowExecution[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  async createWorkflow(config: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const workflow: Workflow = {
      ...config,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  async getWorkflow(id: string): Promise<Workflow | undefined> {
    return this.workflows.get(id);
  }

  async getAllWorkflows(): Promise<Workflow[]> {
    return Array.from(this.workflows.values());
  }

  async executeWorkflow(workflowId: string, initialData?: Record<string, any>): Promise<WorkflowExecution> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const execution: WorkflowExecution = {
      id: crypto.randomUUID(),
      workflowId,
      status: 'running',
      results: initialData || {},
      startedAt: new Date(),
    };

    this.executions.push(execution);

    try {
      let currentStep = workflow.steps[0];

      while (currentStep) {
        execution.currentStep = currentStep.id;
        const result = await this.executeStep(currentStep, execution.results);
        execution.results[currentStep.id] = result;

        if (currentStep.next) {
          currentStep = workflow.steps.find(s => s.id === currentStep!.next) || undefined;
        } else {
          break;
        }
      }

      execution.status = 'completed';
      execution.completedAt = new Date();
      this.eventBus.emit('workflow:completed', { execution });
    } catch (error) {
      execution.status = 'failed';
      execution.error = (error as Error).message;
      execution.completedAt = new Date();
      this.eventBus.emit('workflow:failed', { execution, error });
    }

    return execution;
  }

  private async executeStep(step: WorkflowStep, context: Record<string, any>): Promise<any> {
    logger.info(`Executing step: ${step.name} (${step.type})`);

    switch (step.type) {
      case 'http':
        return { success: true, url: step.config.url };
      case 'email':
        return { success: true, recipient: step.config.recipient };
      case 'delay':
        return { success: true, delay: step.config.duration };
      default:
        return { success: true };
    }
  }

  async getExecution(id: string): Promise<WorkflowExecution | undefined> {
    return this.executions.find(e => e.id === id);
  }

  async getWorkflowExecutions(workflowId: string): Promise<WorkflowExecution[]> {
    return this.executions.filter(e => e.workflowId === workflowId);
  }

  async deleteWorkflow(id: string): Promise<void> {
    this.workflows.delete(id);
  }

  async getStats(): Promise<{ totalWorkflows: number; totalExecutions: number; activeExecutions: number }> {
    return {
      totalWorkflows: this.workflows.size,
      totalExecutions: this.executions.length,
      activeExecutions: this.executions.filter(e => e.status === 'running').length,
    };
  }
}

export const workflowEngine = new WorkflowEngine(new EventBus());
