export interface WorkflowEngineConfig3 {
  name: string;
  version: string;
  maxConcurrentExecutions: number;
  defaultTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  enableLogging: boolean;
  enableMetrics: boolean;
  enableAudit: boolean;
  persistenceEnabled: boolean;
  persistencePath: string;
  heartbeatIntervalMs: number;
  deadLetterEnabled: boolean;
  maxHistorySize: number;
}
export interface Workflow3 {
  id: string;
  name: string;
  version: number;
  description: string;
  steps: WorkflowStep3[];
  variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  enabled: boolean;
  tags: string[];
  timeout: number;
  maxRetries: number;
}
export interface WorkflowStep3 {
  id: string;
  name: string;
  type: string;
  action: string;
  config: Record<string, unknown>;
  nextStep?: string;
  errorStep?: string;
  conditions: WorkflowCondition3[];
  retryPolicy: { maxRetries: number; retryDelayMs: number; backoffMultiplier: number };
  timeout: number;
  compensationStep?: string;
  metadata: Record<string, unknown>;
}
export interface WorkflowCondition3 {
  field: string;
  operator: string;
  value: unknown;
  negate: boolean;
}
export interface WorkflowExecution3 {
  id: string;
  workflowId: string;
  status: string;
  currentStepId: string;
  variables: Record<string, unknown>;
  stepResults: Map<string, { status: string; output: unknown; error?: string; duration: number; startedAt: Date; completedAt?: Date }>;
  history: WorkflowHistoryEntry3[];
  startedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  retryCount: number;
  metadata: Record<string, unknown>;
}
export interface WorkflowHistoryEntry3 {
  stepId: string;
  action: string;
  status: string;
  input: unknown;
  output: unknown;
  error?: string;
  duration: number;
  timestamp: Date;
}
export interface WorkflowMetrics3 {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgExecutionTimeMs: number;
  p95ExecutionTimeMs: number;
  p99ExecutionTimeMs: number;
  activeExecutions: number;
  queuedExecutions: number;
  totalStepsExecuted: number;
  avgStepTimeMs: number;
  retryRate: number;
  compensationRate: number;
}
export class WorkflowEngine3 {
  private config: WorkflowEngineConfig3;
  private workflows: Map<string, Workflow3> = new Map();
  private executions: Map<string, WorkflowExecution3> = new Map();
  private executionQueue: Array<{ executionId: string; priority: number; enqueuedAt: Date }> = [];
  private metrics: WorkflowMetrics{N>;
  private executionTimes: number[] = [];
  private stepTimes: number[] = [];
  private actionHandlers: Map<string, (input: unknown, context: Record<string, unknown>) => Promise<unknown>> = new Map();
  private compensationHandlers: Map<string, (input: unknown, context: Record<string, unknown>) => Promise<unknown>> = new Map();
  private eventHandlers: Map<string, Array<(event: string, data: unknown) => void>> = new Map();
  private auditLog: Array<{ executionId: string; stepId: string; action: string; status: string; timestamp: Date; duration: number }> = [];
  private heartbeats: Map<string, Date> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WorkflowEngineConfig3) {
    this.config = config;
    this.metrics = {
      totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0, avgExecutionTimeMs: 0,
      p95ExecutionTimeMs: 0, p99ExecutionTimeMs: 0, activeExecutions: 0, queuedExecutions: 0,
      totalStepsExecuted: 0, avgStepTimeMs: 0, retryRate: 0, compensationRate: 0,
    };
  }

  registerWorkflow(workflow: Workflow3): void {
    this.workflows.set(workflow.id, workflow);
  }

  unregisterWorkflow(workflowId: string): void {
    this.workflows.delete(workflowId);
  }

  registerActionHandler(action: string, handler: (input: unknown, context: Record<string, unknown>) => Promise<unknown>): void {
    this.actionHandlers.set(action, handler);
  }

  registerCompensationHandler(action: string, handler: (input: unknown, context: Record<string, unknown>) => Promise<unknown>): void {
    this.compensationHandlers.set(action, handler);
  }

  async startExecution(workflowId: string, variables: Record<string, unknown> = {}): Promise<WorkflowExecution3> {
    var workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Workflow not found: ' + workflowId);
    if (!workflow.enabled) throw new Error('Workflow is disabled: ' + workflowId);
    var execution: WorkflowExecution3 = {
      id: crypto.randomUUID(), workflowId: workflowId, status: 'running',
      currentStepId: workflow.steps[0]?.id || '', variables: Object.assign({}, workflow.variables, variables),
      stepResults: new Map(), history: [], startedAt: new Date(), retryCount: 0, metadata: {},
    };
    this.executions.set(execution.id, execution);
    this.metrics.totalExecutions++;
    this.metrics.activeExecutions++;
    this.emit('execution:started', { executionId: execution.id, workflowId: workflowId });
    await this.executeStep(execution, workflow);
    return execution;
  }

  private async executeStep(execution: WorkflowExecution3, workflow: Workflow3): Promise<void> {
    var step = workflow.steps.find(function(s) { return s.id === execution.currentStepId; });
    if (!step) {
      execution.status = 'completed';
      execution.completedAt = new Date();
      this.metrics.successfulExecutions++;
      this.metrics.activeExecutions--;
      this.recordExecutionTime(execution);
      this.emit('execution:completed', { executionId: execution.id });
      return;
    }
    var conditionsMet = this.evaluateConditions(step.conditions, execution.variables);
    if (!conditionsMet) {
      execution.history.push({ stepId: step.id, action: 'skip', status: 'skipped', input: null, output: null, duration: 0, timestamp: new Date() });
      execution.currentStepId = step.nextStep || '';
      await this.executeStep(execution, workflow);
      return;
    }
    var start = Date.now();
    var handler = this.actionHandlers.get(step.action);
    if (!handler) {
      execution.history.push({ stepId: step.id, action: step.action, status: 'error', input: null, output: null, error: 'No handler for action: ' + step.action, duration: Date.now() - start, timestamp: new Date() });
      execution.status = 'failed';
      execution.failedAt = new Date();
      execution.error = 'No handler for action: ' + step.action;
      this.metrics.failedExecutions++;
      this.metrics.activeExecutions--;
      this.recordExecutionTime(execution);
      this.emit('execution:failed', { executionId: execution.id, error: execution.error });
      return;
    }
    try {
      var output = await handler(execution.variables, { executionId: execution.id, stepId: step.id, workflowId: execution.workflowId });
      var duration = Date.now() - start;
      execution.stepResults.set(step.id, { status: 'completed', output: output, duration: duration, startedAt: new Date(start), completedAt: new Date() });
      execution.history.push({ stepId: step.id, action: step.action, status: 'completed', input: execution.variables, output: output, duration: duration, timestamp: new Date() });
      this.metrics.totalStepsExecuted++;
      this.stepTimes.push(duration);
      this.updateStepMetrics();
      this.auditLog.push({ executionId: execution.id, stepId: step.id, action: step.action, status: 'completed', timestamp: new Date(), duration: duration });
      this.emit('step:completed', { executionId: execution.id, stepId: step.id, duration: duration });
      execution.currentStepId = step.nextStep || '';
      await this.executeStep(execution, workflow);
    } catch (error) {
      var duration = Date.now() - start;
      execution.stepResults.set(step.id, { status: 'failed', output: null, error: error instanceof Error ? error.message : 'Unknown', duration: duration, startedAt: new Date(start), completedAt: new Date() });
      execution.history.push({ stepId: step.id, action: step.action, status: 'failed', input: execution.variables, output: null, error: error instanceof Error ? error.message : 'Unknown', duration: duration, timestamp: new Date() });
      this.auditLog.push({ executionId: execution.id, stepId: step.id, action: step.action, status: 'failed', timestamp: new Date(), duration: duration });
      if (execution.retryCount < (step.retryPolicy?.maxRetries || workflow.maxRetries || this.config.maxRetries)) {
        execution.retryCount++;
        this.metrics.retryRate = (this.metrics.retryRate * (this.metrics.totalExecutions - 1) + 1) / this.metrics.totalExecutions;
        var delay = Math.min((step.retryPolicy?.retryDelayMs || this.config.retryDelayMs) * Math.pow(step.retryPolicy?.backoffMultiplier || this.config.backoffMultiplier, execution.retryCount - 1), 30000);
        await new Promise(function(r) { setTimeout(r, delay); }.bind(this));
        await this.executeStep(execution, workflow);
      } else if (step.compensationStep) {
        execution.history.push({ stepId: step.id, action: 'compensate', status: 'compensating', input: null, output: null, duration: 0, timestamp: new Date() });
        this.metrics.compensationRate = (this.metrics.compensationRate * (this.metrics.totalExecutions - 1) + 1) / this.metrics.totalExecutions;
        await this.executeCompensation(execution, workflow, step.compensationStep);
        execution.status = 'failed';
        execution.failedAt = new Date();
        execution.error = error instanceof Error ? error.message : 'Unknown';
        this.metrics.failedExecutions++;
        this.metrics.activeExecutions--;
        this.recordExecutionTime(execution);
        this.emit('execution:failed', { executionId: execution.id, error: execution.error });
      } else {
        execution.status = 'failed';
        execution.failedAt = new Date();
        execution.error = error instanceof Error ? error.message : 'Unknown';
        this.metrics.failedExecutions++;
        this.metrics.activeExecutions--;
        this.recordExecutionTime(execution);
        this.emit('execution:failed', { executionId: execution.id, error: execution.error });
      }
    }
  }

  private async executeCompensation(execution: WorkflowExecution{N>, workflow: Workflow3, compensationStepId: string): Promise<void> {
    var step = workflow.steps.find(function(s) { return s.id === compensationStepId; });
    if (!step) return;
    var handler = this.compensationHandlers.get(step.action);
    if (!handler) return;
    try {
      await handler(execution.variables, { executionId: execution.id, stepId: step.id, workflowId: execution.workflowId, compensation: true });
    } catch (e) { /* compensation failed */ }
  }

  private evaluateConditions(conditions: WorkflowCondition3[], variables: Record<string, unknown>): boolean {
    if (conditions.length === 0) return true;
    return conditions.every(function(c) {
      var value = variables[c.field];
      var result = false;
      switch (c.operator) {
        case 'equals': result = value === c.value; break;
        case 'notEquals': result = value !== c.value; break;
        case 'greaterThan': result = Number(value) > Number(c.value); break;
        case 'lessThan': result = Number(value) < Number(c.value); break;
        case 'contains': result = String(value).includes(String(c.value)); break;
        default: result = true;
      }
      return c.negate ? !result : result;
    });
  }

  private recordExecutionTime(execution: WorkflowExecution3): void {
    var duration = (execution.completedAt || execution.failedAt || new Date()).getTime() - execution.startedAt.getTime();
    this.executionTimes.push(duration);
    if (this.executionTimes.length > 10000) this.executionTimes = this.executionTimes.slice(-5000);
    this.updateExecutionMetrics();
  }

  private updateExecutionMetrics(): void {
    this.metrics.avgExecutionTimeMs = this.executionTimes.reduce(function(a, b) { return a + b; }, 0) / this.executionTimes.length;
    var sorted = this.executionTimes.slice().sort(function(a, b) { return a - b; });
    this.metrics.p95ExecutionTimeMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
    this.metrics.p99ExecutionTimeMs = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  private updateStepMetrics(): void {
    this.metrics.avgStepTimeMs = this.stepTimes.reduce(function(a, b) { return a + b; }, 0) / this.stepTimes.length;
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    var execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') return false;
    execution.status = 'cancelled';
    execution.completedAt = new Date();
    this.metrics.activeExecutions--;
    this.emit('execution:cancelled', { executionId: executionId });
    return true;
  }

  async retryExecution(executionId: string): Promise<WorkflowExecution3 | null> {
    var execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'failed') return null;
    var workflow = this.workflows.get(execution.workflowId);
    if (!workflow) return null;
    execution.status = 'running';
    execution.retryCount = 0;
    execution.error = undefined;
    this.metrics.activeExecutions++;
    this.emit('execution:retried', { executionId: executionId });
    await this.executeStep(execution, workflow);
    return execution;
  }

  getExecution(executionId: string): WorkflowExecution3 | undefined { return this.executions.get(executionId); }
  getWorkflow(workflowId: string): Workflow3 | undefined { return this.workflows.get(workflowId); }
  getMetrics(): WorkflowMetrics{N> { return Object.assign({}, this.metrics); }
  getAuditLog(limit: number = 100): Array<{ executionId: string; stepId: string; action: string; status: string; timestamp: Date; duration: number }> { return this.auditLog.slice(-limit); }
  on(event: string, handler: (event: string, data: unknown) => void): void { if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, []); this.eventHandlers.get(event)!.push(handler); }
  private emit(event: string, data: unknown): void { var handlers = this.eventHandlers.get(event) || []; for (var h of handlers) h(event, data); }
  destroy(): void { if (this.heartbeatTimer) clearInterval(this.heartbeatTimer); this.workflows.clear(); this.executions.clear(); this.executionQueue = []; this.actionHandlers.clear(); this.compensationHandlers.clear(); this.eventHandlers.clear(); this.auditLog = []; }
}
export function createWorkflowEngine3(config: WorkflowEngineConfig{N>): WorkflowEngine3 { return new WorkflowEngine3(config); }
export function getDefaultWorkflowEngineConfig3(): WorkflowEngineConfig3 {
  return { name: 'WorkflowEngine3', version: '1.0.0', maxConcurrentExecutions: 10, defaultTimeoutMs: 300000, maxRetries: 3, retryDelayMs: 1000, backoffMultiplier: 2, enableLogging: true, enableMetrics: true, enableAudit: true, persistenceEnabled: false, persistencePath: '.workflows', heartbeatIntervalMs: 30000, deadLetterEnabled: true, maxHistorySize: 10000 };
}