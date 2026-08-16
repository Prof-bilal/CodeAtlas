export interface WorkflowStep {
  id: string;
  type: string;
  name: string;
  config: Record<string, any>;
  next?: string;
  condition?: string;
}

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  trigger: WorkflowTrigger;
  active: boolean;
  lastRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'event';
  config: Record<string, any>;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  steps: WorkflowStep[];
  trigger: WorkflowTrigger;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  steps?: WorkflowStep[];
  trigger?: WorkflowTrigger;
  active?: boolean;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
}

export interface WorkflowStepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input?: any;
  output?: any;
  error?: string;
  duration?: number;
}

export interface WorkflowStats {
  totalWorkflows: number;
  activeWorkflows: number;
  totalRuns: number;
  successRate: number;
  averageDuration: number;
}

export const WORKFLOW_STEP_TYPES = [
  'http',
  'transform',
  'filter',
  'delay',
  'condition',
  'parallel',
  'aggregate',
  'notify',
] as const;

export type WorkflowStepType = typeof WORKFLOW_STEP_TYPES[number];

export const WORKFLOW_TRIGGERS = [
  'manual',
  'schedule',
  'event',
] as const;

export type WorkflowTriggerType = typeof WORKFLOW_TRIGGERS[number];
