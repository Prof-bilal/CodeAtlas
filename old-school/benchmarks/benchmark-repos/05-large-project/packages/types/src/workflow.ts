export type WorkflowStatus = 'active' | 'draft' | 'paused' | 'archived';
export type TriggerType = 'manual' | 'schedule' | 'event' | 'webhook' | 'api';
export interface Workflow { id: string; name: string; status: WorkflowStatus; trigger: WorkflowTrigger; steps: WorkflowStep[]; connections: WorkflowConnection[]; version: number; executionCount: number; createdAt: Date; }
export interface WorkflowTrigger { type: TriggerType; config: Record<string, unknown>; enabled: boolean; }
export interface WorkflowStep { id: string; name: string; type: 'action' | 'condition' | 'delay' | 'notification' | 'code' | 'http_request'; config: StepConfig; position: { x: number; y: number }; }
export interface StepConfig { action?: string; parameters: Record<string, unknown>; retries?: number; timeout?: number; }
export interface WorkflowConnection { sourceStepId: string; targetStepId: string; condition?: { field: string; operator: string; value: unknown }; }
export interface WorkflowExecution { id: string; workflowId: string; status: 'running' | 'completed' | 'failed' | 'cancelled'; input: Record<string, unknown>; output?: Record<string, unknown>; stepExecutions: StepExecution[]; startedAt: Date; completedAt?: Date; }
export interface StepExecution { stepId: string; status: 'pending' | 'running' | 'completed' | 'failed'; output?: unknown; duration?: number; error?: string; }