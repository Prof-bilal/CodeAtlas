export interface StateConfig {
  [state: string]: {
    [event: string]: string;
  };
}

export interface StateMachineConfig {
  initial: string;
  states: StateConfig;
  actions?: Record<string, (context: unknown) => void>;
  guards?: Record<string, (context: unknown) => boolean>;
}

export interface StateTransition {
  from: string;
  to: string;
  event: string;
  timestamp: Date;
}

export class StateMachine {
  private config: StateMachineConfig;
  private currentState: string;
  private context: unknown;
  private history: StateTransition[] = [];

  constructor(config: StateMachineConfig, context: unknown = {}) {
    this.config = config;
    this.currentState = config.initial;
    this.context = context;
  }

  getCurrentState(): string {
    return this.currentState;
  }

  getAvailableEvents(): string[] {
    const stateConfig = this.config.states[this.currentState];
    return stateConfig ? Object.keys(stateConfig) : [];
  }

  canTransition(event: string): boolean {
    const stateConfig = this.config.states[this.currentState];
    if (!stateConfig || !(event in stateConfig)) return false;
    const targetState = stateConfig[event];
    if (this.config.guards?.[`${this.currentState}_${event}_${targetState}`]) {
      return this.config.guards[`${this.currentState}_${event}_${targetState}`](this.context);
    }
    return true;
  }

  transition(event: string): string {
    if (!this.canTransition(event)) {
      throw new Error(`Cannot transition from ${this.currentState} with event ${event}`);
    }
    const targetState = this.config.states[this.currentState][event];
    const transition: StateTransition = {
      from: this.currentState,
      to: targetState,
      event,
      timestamp: new Date(),
    };
    this.history.push(transition);
    const actionKey = `${this.currentState}_${event}_${targetState}`;
    if (this.config.actions?.[actionKey]) {
      this.config.actions[actionKey](this.context);
    }
    this.currentState = targetState;
    return targetState;
  }

  getHistory(): StateTransition[] {
    return [...this.history];
  }

  getContext(): unknown {
    return this.context;
  }

  setContext(context: unknown): void {
    this.context = context;
  }

  reset(): void {
    this.currentState = this.config.initial;
    this.history = [];
  }
}

export function createStateMachine(config: StateMachineConfig, context?: unknown): StateMachine {
  return new StateMachine(config, context);
}
